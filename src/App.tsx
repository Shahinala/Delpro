/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Rocket, 
  Settings, 
  Plus, 
  Trash2, 
  Edit2, 
  Download, 
  Moon, 
  Sun, 
  TrendingUp, 
  Package, 
  CreditCard, 
  Calendar,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  X,
  Menu,
  BrainCircuit,
  Trophy,
  Cloud,
  CloudOff,
  RefreshCw,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  Sparkles,
  Volume2,
  HardDrive,
  Zap,
  LogOut,
  User,
  DollarSign,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths, eachMonthOfInterval, eachDayOfInterval } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import { AIChat } from './components/AIChat';

import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc
} from './firebase';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface LogEntry {
  id: string;
  uid?: string;
  date: string;
  count: number;
  advance: number;
  extraLeave: number;
}

interface AppSettings {
  theme: 'dark' | 'light';
  target: number;
  shiftTime: string;
  userName: string;
  userRole: string;
  userBio: string;
  userAvatar: string;
  notificationSound: string;
  notificationVolume: number;
  baseSalary: number;
  deliveryRate: number;
  holidays: string[];
  autoBackup: 'daily' | 'weekly' | 'never';
  lastBackupDate: string | null;
  lastBackupSize: string | null;
}

type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline';

export default function App() {
  // --- State ---
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = localStorage.getItem('deliveryLogs');
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings');
    const defaultSettings: AppSettings = { 
      theme: 'dark', 
      target: 300, 
      shiftTime: '14:00',
      userName: 'Commander',
      userRole: 'Senior Rider',
      userBio: 'Navigating the neon streets of the future.',
      userAvatar: 'commander-1',
      notificationSound: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', // Futuristic beep
      notificationVolume: 0.5,
      baseSalary: 9000,
      deliveryRate: 20,
      holidays: [],
      autoBackup: 'never',
      lastBackupDate: null,
      lastBackupSize: null
    };
    
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure all keys exist to prevent uncontrolled input warning
      return { ...defaultSettings, ...parsed };
    }
    return defaultSettings;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? 'synced' : 'offline');
  const [lastSynced, setLastSynced] = useState<string | null>(localStorage.getItem('lastSynced'));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    count: '',
    advance: '',
    extraLeave: ''
  });

  const [aiOverlay, setAiOverlay] = useState<{ show: boolean; message: string; step: number }>({
    show: false,
    message: '',
    step: 0
  });

  const [isShiftActive, setIsShiftActive] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [dynamicAiInsight, setDynamicAiInsight] = useState("সিস্টেম প্রস্তুত। আপনার প্রথম এন্ট্রিটি যোগ করুন।");
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [googleTokens, setGoogleTokens] = useState<any>(() => {
    const saved = localStorage.getItem('google_tokens');
    return saved ? JSON.parse(saved) : null;
  });
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSystemInitialized, setIsSystemInitialized] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'error' | 'success' | 'info'; duration?: number }[]>([]);

  const addToast = useCallback((message: string, type: 'error' | 'success' | 'info' = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type, duration }]);
    if (duration !== Infinity) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Centralized API handler
  const apiCall = useCallback(async (url: string, options: RequestInit = {}, timeout = 10000) => {
    if (!navigator.onLine) {
      throw new Error("ইন্টারনেট সংযোগ বিচ্ছিন্ন! দয়া করে আপনার কানেকশন চেক করুন।");
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const savedTokens = localStorage.getItem('google_tokens');
      const tokensToUse = googleTokens || (savedTokens ? JSON.parse(savedTokens) : null);
      
      const headers = { ...options.headers } as any;
      if (tokensToUse) headers['x-google-tokens'] = JSON.stringify(tokensToUse);
      
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        credentials: 'include'
      });
      clearTimeout(id);

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          throw { status: 401, message: "গুগল অথেন্টিকেশন ল্যাপস হয়েছে।", data };
        }
        if (res.status === 404) {
          throw { status: 404, message: "সার্ভারে ডাটা খুঁজে পাওয়া যায়নি।", data };
        }
        if (res.status >= 500) {
          throw { status: 500, message: "সার্ভারে সমস্যা হয়েছে! দয়া করে কিছুক্ষণ পর চেষ্টা করুন।", data };
        }
        throw { status: res.status, message: data.error || "অজানা সমস্যা হয়েছে।", data };
      }

      return data;
    } catch (err: any) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        throw new Error("রিকোয়েস্ট টাইমআউট হয়েছে! সার্ভার রেসপন্স করছে না।");
      }
      throw err;
    }
  }, [googleTokens]);

  const [activeSettingsSection, setActiveSettingsSection] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'delete' | 'edit' | 'info' | 'setup';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'info'
  });

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('deliveryLogs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    // Basic validation before saving
    if (!settings.userName.trim()) {
      setSettingsError("নাম খালি রাখা যাবে না।");
    } else if (settings.target <= 0) {
      setSettingsError("টার্গেট অবশ্যই ০-এর বেশি হতে হবে।");
    } else if (settings.baseSalary < 0 || settings.deliveryRate < 0) {
      setSettingsError("স্যালারি ভ্যালু নেগেটিভ হতে পারবে না।");
    } else {
      setSettingsError(null);
      localStorage.setItem('appSettings', JSON.stringify(settings));
      if (user) {
        setDoc(doc(db, 'users', user.uid), { ...settings, uid: user.uid, email: user.email }, { merge: true })
          .catch(err => console.error("Settings Sync Error:", err));
      }
    }

    if (settings.theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }

    // Migration for broken sound URLs
    const brokenUrls = [
      'https://cdn.pixabay.com/audio/2022/03/15/audio_78390a3607.mp3',
      'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3',
      'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73053.mp3'
    ];
    if (brokenUrls.includes(settings.notificationSound)) {
      setSettings(s => ({ ...s, notificationSound: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3' }));
    }
  }, [settings]);

  useEffect(() => {
    if (googleTokens) {
      localStorage.setItem('google_tokens', JSON.stringify(googleTokens));
    } else {
      localStorage.removeItem('google_tokens');
    }
  }, [googleTokens]);

  // --- Firebase Auth & Data Sync ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);

      if (currentUser) {
        // Load settings from Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setSettings(s => ({ ...s, ...userDoc.data() }));
        } else {
          // Initialize user doc if it doesn't exist
          const initialSettings = {
            uid: currentUser.uid,
            email: currentUser.email,
            userName: currentUser.displayName || 'Rider',
            userRole: 'Rider',
            userBio: 'Cyber Rider Pro User',
            userAvatar: `bot-${currentUser.uid.slice(0, 5)}`,
            target: 300,
            shiftTime: '14:00',
            baseSalary: 9000,
            deliveryRate: 20,
            theme: 'dark',
            notificationVolume: 0.5,
            notificationSound: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
            holidays: [],
            autoBackup: 'never',
            lastBackupDate: null,
            lastBackupSize: null
          };
          await setDoc(doc(db, 'users', currentUser.uid), initialSettings);
          setSettings(s => ({ ...s, ...initialSettings }));
        }

        // Real-time logs sync
        const q = query(collection(db, 'logs'), where('uid', '==', currentUser.uid));
        const unsubscribeLogs = onSnapshot(q, (snapshot) => {
          const fetchedLogs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as LogEntry[];
          setLogs(fetchedLogs);
          localStorage.setItem('deliveryLogs', JSON.stringify(fetchedLogs));
        }, (error) => {
          console.error("Firestore Logs Error:", error);
        });

        return () => unsubscribeLogs();
      } else {
        setLogs([]);
        localStorage.removeItem('deliveryLogs');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const handleSidebarLogout = () => {
    setConfirmModal({
      show: true,
      title: 'Logout? 🚪',
      message: 'আপনি কি নিশ্চিত যে লগআউট করতে চান?',
      onConfirm: () => {
        handleLogout();
        setConfirmModal(prev => ({ ...prev, show: false }));
        setIsSidebarOpen(false);
      },
      type: 'info'
    });
  };

  // --- Network Listeners ---
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('pending');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Sync Logic ---
  const syncWithCloud = useCallback(async (isRetry = false) => {
    if (!isOnline || syncStatus === 'syncing') return;

    setSyncStatus('syncing');
    
    try {
      if (isGoogleAuthenticated) {
        const data = await apiCall('/api/backup/google-drive', {
          method: 'POST',
          body: JSON.stringify({
            data: { logs, settings },
            fileName: `cyber_rider_backup_${user?.uid || 'user'}.json`
          })
        }).catch(async (err) => {
          if (err.status === 401 && !isRetry && user) {
            console.warn("Unauthorized sync, attempting restoration with local/cloud tokens...");
            const tokenDoc = await getDoc(doc(db, 'google_tokens', user.uid));
            const tokens = tokenDoc.exists() ? tokenDoc.data().tokens : null;

            if (tokens) {
              setGoogleTokens(tokens);
              const restoreRes = await fetch('/api/auth/google/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ tokens })
              });
              if (restoreRes.ok) {
                await syncWithCloud(true);
                return null;
              }
            }
            setIsGoogleAuthenticated(false);
            setGoogleTokens(null);
            localStorage.removeItem('google_tokens');
            addToast("গুগল ড্রাইভ অথেন্টিকেশন ল্যাপস! দয়া করে সেটিংস থেকে Repair করুন।", 'error');
            throw err;
          }
          throw err;
        });
        
        if (!data) return;

        if (data.newTokens) {
          setGoogleTokens(data.newTokens);
          localStorage.setItem('google_tokens', JSON.stringify(data.newTokens));
          if (user) {
            setDoc(doc(db, 'google_tokens', user.uid), { 
              tokens: data.newTokens,
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(console.error);
          }
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      const now = new Date().toISOString();
      setLastSynced(now);
      localStorage.setItem('lastSynced', now);
      setSyncStatus('synced');
    } catch (err: any) {
      console.error("Sync error:", err);
      setSyncStatus('offline');
      addToast(err.message || "সিঙ্ক করতে সমস্যা হয়েছে।", 'error');
    }
  }, [isOnline, syncStatus, isGoogleAuthenticated, logs, settings, googleTokens, user, apiCall, addToast]);

  // Auto-sync when coming back online or when data changes
  useEffect(() => {
    if (isOnline && syncStatus === 'pending') {
      syncWithCloud();
    }
  }, [isOnline, syncStatus, syncWithCloud]);

  // Update sync status to pending when logs change
  const logsRef = useRef(logs);
  useEffect(() => {
    if (logs !== logsRef.current) {
      if (isOnline) {
        setSyncStatus('pending');
      } else {
        setSyncStatus('offline');
      }
      logsRef.current = logs;
    }
  }, [logs, isOnline]);

  // --- Calculations ---
  const filteredLogs = useMemo(() => {
    return logs.filter(log => log.date.startsWith(selectedMonth));
  }, [logs, selectedMonth]);

  const stats = useMemo(() => {
    const totalDel = filteredLogs.reduce((sum, log) => sum + log.count, 0);
    const totalAdv = filteredLogs.reduce((sum, log) => sum + log.advance, 0);
    const totalLeave = filteredLogs.reduce((sum, log) => sum + log.extraLeave, 0);
    
    let bonus = 0;
    if (totalDel >= 350) bonus = 2000;
    else if (totalDel >= 300) bonus = 1000;

    const fine = Math.round((settings.baseSalary / 30) * totalLeave);
    const netSalary = (settings.baseSalary + (totalDel * settings.deliveryRate) + bonus) - totalAdv - fine;

    return { totalDel, totalAdv, totalLeave, bonus, fine, netSalary };
  }, [filteredLogs, settings]);

  const chartData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });

    return months.map(m => {
      const mKey = format(m, 'yyyy-MM');
      const count = logs
        .filter(log => log.date.startsWith(mKey))
        .reduce((sum, log) => sum + log.count, 0);
      return {
        name: format(m, 'MMM'),
        count
      };
    });
  }, [logs]);

  useEffect(() => {
    const checkGoogleAuth = async (retries = 3) => {
      try {
        const data = await apiCall('/api/auth/google/status');
        
        if (!data.isAuthenticated && user) {
          // If not authenticated on server, try to restore from Firestore
          const tokenDoc = await getDoc(doc(db, 'google_tokens', user.uid));
          if (tokenDoc.exists()) {
            const tokens = tokenDoc.data().tokens;
            setGoogleTokens(tokens);
            const restoreData = await apiCall('/api/auth/google/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens })
            });
            if (restoreData.status === "Session restored") {
              setIsGoogleAuthenticated(true);
              return;
            }
          }
        }
        
        setIsGoogleAuthenticated(data.isAuthenticated);
      } catch (err: any) {
        if (retries > 0) {
          console.warn(`Auth check failed, retrying... (${retries} left)`);
          setTimeout(() => checkGoogleAuth(retries - 1), 2000);
        } else {
          console.error("Auth check failed after retries:", err);
          setIsGoogleAuthenticated(false);
        }
      }
    };

    if (!isAuthLoading) {
      checkGoogleAuth();
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGoogleAuthenticated(true);
        if (event.data.tokens) {
          setGoogleTokens(event.data.tokens);
          localStorage.setItem('google_tokens', JSON.stringify(event.data.tokens));
        }
        
        // Persist tokens to Firestore for future sessions
        if (user && event.data.tokens) {
          await setDoc(doc(db, 'google_tokens', user.uid), { 
            tokens: event.data.tokens,
            updatedAt: new Date().toISOString()
          });
        }
        
        addToast("গুগল ড্রাইভ সফলভাবে সংযুক্ত হয়েছে! ✅", 'success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user, isAuthLoading, addToast]);

  const connectGoogleDrive = async () => {
    try {
      const data = await apiCall('/api/auth/google/url');
      const { url } = data;
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const authWindow = window.open(
        url, 
        'google_auth', 
        `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
      );

      if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
        addToast("পপ-আপ ব্লক করা হয়েছে! অনুগ্রহ করে ব্রাউজারের পপ-আপ সেটিংস চেক করুন।", 'error');
      }
    } catch (err: any) {
      console.error("Connect error:", err);
      addToast(err.message || "গুগল ড্রাইভের সাথে সংযোগ করা যায়নি।", 'error');
    }
  };

  const backupToGoogleDrive = useCallback(async (isAuto = false, isRetry = false) => {
    if (!isGoogleAuthenticated) {
      if (!isAuto) connectGoogleDrive();
      return;
    }

    setIsBackingUp(true);
    try {
      const data = await apiCall('/api/backup/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { logs, settings },
          fileName: `cyber_rider_backup_${user?.uid || 'user'}.json`
        })
      }).catch(async (err) => {
        if (err.status === 401 && !isRetry && user) {
          console.warn("Unauthorized backup, attempting restoration with local/cloud tokens...");
          const tokenDoc = await getDoc(doc(db, 'google_tokens', user.uid));
          const tokens = tokenDoc.exists() ? tokenDoc.data().tokens : null;

          if (tokens) {
            setGoogleTokens(tokens);
            const restoreRes = await fetch('/api/auth/google/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ tokens })
            });
            if (restoreRes.ok) {
              await backupToGoogleDrive(isAuto, true);
              return null;
            }
          }
          setIsGoogleAuthenticated(false);
          setGoogleTokens(null);
          localStorage.removeItem('google_tokens');
          addToast("গুগল ড্রাইভ অথেন্টিকেশন ল্যাপস! দয়া করে পুনরায় কানেক্ট করুন।", 'error');
          throw err;
        }
        throw err;
      });

      if (!data) return;

      if (data.newTokens) {
        setGoogleTokens(data.newTokens);
        localStorage.setItem('google_tokens', JSON.stringify(data.newTokens));
        if (user) {
          setDoc(doc(db, 'google_tokens', user.uid), { 
            tokens: data.newTokens,
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(console.error);
        }
      }

      const now = new Date().toISOString();
      const size = `${(JSON.stringify({ logs, settings }).length / 1024).toFixed(1)} KB`;
      
      setSettings(s => ({
        ...s,
        lastBackupDate: now,
        lastBackupSize: size
      }));
      
      if (!isAuto) {
        addToast("সফলভাবে ক্লাউডে ব্যাকআপ করা হয়েছে! ☁️", 'success');
      }
    } catch (err: any) {
      console.error("Backup error:", err);
      if (!isAuto) addToast(err.message || "ব্যাকআপ ব্যর্থ হয়েছে!", 'error');
    } finally {
      setIsBackingUp(false);
    }
  }, [isGoogleAuthenticated, googleTokens, logs, settings, user, apiCall, addToast]);

  const restoreFromGoogleDrive = useCallback(async (isRetry = false) => {
    if (!isGoogleAuthenticated) {
      connectGoogleDrive();
      return;
    }

    setAiOverlay({ show: true, message: 'রিপোরিং ডেটা ফ্রম ক্লাউড...', step: 0 });
    try {
      const data = await apiCall(`/api/backup/google-drive/restore?fileName=cyber_rider_backup_${user?.uid || 'user'}.json`)
        .catch(async (err) => {
          if (err.status === 401 && !isRetry && user) {
            console.warn("Unauthorized restore, attempting restoration with local/cloud tokens...");
            const tokenDoc = await getDoc(doc(db, 'google_tokens', user.uid));
            const tokens = tokenDoc.exists() ? tokenDoc.data().tokens : null;

            if (tokens) {
              setGoogleTokens(tokens);
              const restoreRes = await fetch('/api/auth/google/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ tokens })
              });
              if (restoreRes.ok) {
                await restoreFromGoogleDrive(true);
                return null;
              }
            }
            setIsGoogleAuthenticated(false);
            setGoogleTokens(null);
            localStorage.removeItem('google_tokens');
            addToast("গুগল ড্রাইভ লগইন এক্সপায়ার হয়েছে!", 'error');
            throw err;
          }
          throw err;
        });
      
      if (!data) return;
      
      if (data.newTokens) {
        setGoogleTokens(data.newTokens);
        localStorage.setItem('google_tokens', JSON.stringify(data.newTokens));
        if (user) {
          setDoc(doc(db, 'google_tokens', user.uid), { 
            tokens: data.newTokens,
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(console.error);
        }
      }

      const { logs: restoredLogs, settings: restoredSettings } = data.data;
      
      setConfirmModal({
        show: true,
        title: 'Restore Backup? 💾',
        message: `একটি ব্যাকআপ পাওয়া গেছে (${data.info.size} bytes, ${format(parseISO(data.info.modifiedTime), 'PPp')})। আপনি কি আপনার বর্তমান ডেটা বর্তমান এই ফাইল দিয়ে রিপ্লেস করতে চান?`,
        onConfirm: () => {
          setLogs(restoredLogs);
          setSettings(s => ({ ...s, ...restoredSettings }));
          setSyncStatus('synced');
          setConfirmModal(prev => ({ ...prev, show: false }));
          addToast("ডেটা রিস্টোর সম্পন্ন হয়েছে! ✅", 'success');
        },
        type: 'info'
      });
    } catch (err: any) {
      console.error("Restore error:", err);
      addToast(err.message || "ডেটা রিস্টোর ব্যর্থ হয়েছে!", 'error');
    } finally {
      setAiOverlay({ show: false, message: '', step: 0 });
    }
  }, [isGoogleAuthenticated, googleTokens, user, apiCall, addToast]);

  // WhatsApp-style Auto-Backup Logic
  useEffect(() => {
    if (settings.autoBackup === 'never' || !isGoogleAuthenticated) return;

    const checkAutoBackup = () => {
      const lastBackup = settings.lastBackupDate ? parseISO(settings.lastBackupDate) : new Date(0);
      const now = new Date();
      
      const diffMs = now.getTime() - lastBackup.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (settings.autoBackup === 'daily' && diffDays >= 1) {
        backupToGoogleDrive(true);
      } else if (settings.autoBackup === 'weekly' && diffDays >= 7) {
        backupToGoogleDrive(true);
      }
    };

    const timer = setTimeout(checkAutoBackup, 5000); // Check 5 seconds after mount
    return () => clearTimeout(timer);
  }, [settings.autoBackup, isGoogleAuthenticated]);
  const exportLocalBackup = () => {
    const content = JSON.stringify({ logs, settings, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyber_rider_local_${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importLocalBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.logs && data.settings) {
          setConfirmModal({
            show: true,
            title: 'Import Success! ✅',
            message: 'ফাইল থেকে ডেটা পাওয়া গেছে। আপনি কি আপনার বর্তমান ডেটা বর্তমান এই ফাইল দিয়ে রিপ্লেস করতে চান?',
            onConfirm: () => {
              setLogs(data.logs);
              setSettings(s => ({ ...s, ...data.settings }));
              setConfirmModal(prev => ({ ...prev, show: false }));
              alert("ডেটা রিস্টোর সম্পন্ন হয়েছে!");
            },
            type: 'info'
          });
        }
      } catch (err) {
        alert("ভুল ফাইল ফরম্যাট! অনুগ্রহ করে সঠিক JSON ফাইল সিলেক্ট করুন।");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const fetchDynamicInsight = useCallback(async () => {
    if (filteredLogs.length === 0 || isInsightLoading) return;
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API Key is not configured.");
      setDynamicAiInsight("আপনার সেটিংস থেকে Gemini API Key সেট করুন AI ফিচারের জন্য।");
      return;
    }

    setIsInsightLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
        Rider: ${settings.userName} (${settings.userRole})
        Target: ${settings.target}
        Current Month Stats: ${JSON.stringify(stats)}
        Recent Logs: ${JSON.stringify(filteredLogs.slice(0, 5))}
        
        Provide a one-sentence, highly encouraging, futuristic AI insight in Bengali. 
        Focus on their progress towards the target or their earnings. 
        Keep it under 100 characters.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
      });

      if (response.text) {
        setDynamicAiInsight(response.text.trim());
      }
    } catch (error: any) {
      console.error("Insight Error:", error);
      if (error?.message?.includes('403') || error?.message?.includes('permission')) {
        setDynamicAiInsight("AI এক্সেস করতে সমস্যা হচ্ছে। আপনার API কি সঠিক আছে কি না চেক করুন।");
      }
    } finally {
      setIsInsightLoading(false);
    }
  }, [filteredLogs, stats, settings.userName, settings.userRole, settings.target, isInsightLoading]);

  useEffect(() => {
    const timer = setTimeout(fetchDynamicInsight, 2000);
    return () => clearTimeout(timer);
  }, [filteredLogs.length]);

  // --- Notifications ---
  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const playSynthBeep = useCallback((volume = 0.5) => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.error("Synth beep error:", e);
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    const soundUrl = settings.notificationSound;
    
    if (!soundUrl || soundUrl === 'synth') {
      playSynthBeep(settings.notificationVolume);
      return;
    }

    const audio = new Audio(soundUrl);
    audio.volume = settings.notificationVolume;
    
    // Removing crossOrigin as it can cause "no supported source" errors if CORS is not correctly configured on the server
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        // Silent fail for autoplay restrictions
        if (err.name !== 'NotAllowedError') {
          console.error("Sound play error (Source:", soundUrl, "):", err);
          // Fallback to synth if external file fails
          playSynthBeep(settings.notificationVolume);
        }
      });
    }
  }, [settings.notificationSound, settings.notificationVolume, playSynthBeep]);

  const initializeSystem = () => {
    setIsSystemInitialized(true);
    // Play a startup sound to unlock audio context
    playNotificationSound();
  };

  const sendNotification = useCallback((title: string, body: string) => {
    playNotificationSound();
    if (notificationPermission === 'granted') {
      const options = {
        body,
        icon: 'https://api.dicebear.com/7.x/bottts/svg?seed=commander-1',
        vibrate: [200, 100, 200],
        tag: 'cyber-rider-alert',
        renotify: true
      };

      // Best practice: Try to use Service Worker registration (required for many mobile browsers)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, options).catch(err => {
            console.error('Service Worker Notification error:', err);
            // Fallback to manual if SW fails
            try { new Notification(title, options); } catch (e) { console.warn('Standard Notification fallback failed:', e); }
          });
        }).catch(() => {
          // Fallback if SW ready fails
          try { new Notification(title, options); } catch (e) { console.warn('Standard Notification fallback failed:', e); }
        });
      } else {
        // Direct fallback for browsers without SW support
        try {
          new Notification(title, options);
        } catch (e) {
          console.warn('Notification constructor failed:', e);
        }
      }
    }
  }, [notificationPermission, playNotificationSound]);

  // --- Shift Reminder Logic ---
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');

      // Skip holidays
      if (settings.holidays?.includes(todayStr)) return;

      const currentTime = format(now, 'HH:mm');
      
      // Trigger if current time is >= shift time AND shift hasn't been marked as started
      if (currentTime >= settings.shiftTime && !isShiftActive && !aiOverlay.show) {
        // Prevent trigger if already logged today
        const alreadyLogged = logs.some(l => l.date === todayStr);
        if (alreadyLogged) return;

        sendNotification("Shift Reminder 🚨", "বস, অফিসের সময় হয়ে গেছে! দ্রুত বের হন।");
        setAiOverlay({
          show: true,
          message: "আজকে কাজ কি করবেন?",
          step: 1
        });
      }
    };

    // Check immediately on mount and then every minute
    checkTime();
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, [settings.shiftTime, aiOverlay.show, isShiftActive, sendNotification]);

  // Reset shift status at midnight
  useEffect(() => {
    const now = new Date();
    const night = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msToMidnight = night.getTime() - now.getTime();
    
    const timer = setTimeout(() => {
      setIsShiftActive(false);
    }, msToMidnight);
    
    return () => clearTimeout(timer);
  }, [isShiftActive]);

  // --- Target Achievement Notification ---
  const hasNotifiedTarget = useRef(false);
  useEffect(() => {
    if (stats.totalDel >= settings.target && !hasNotifiedTarget.current && stats.totalDel > 0) {
      sendNotification("Target Achieved! 🏆", `অভিনন্দন! আপনি আপনার ${settings.target}টি ডেলিভারির লক্ষ্য পূরণ করেছেন।`);
      hasNotifiedTarget.current = true;
    } else if (stats.totalDel < settings.target) {
      hasNotifiedTarget.current = false;
    }
  }, [stats.totalDel, settings.target, sendNotification]);

  // --- Handlers ---
  const handleSaveEntry = async () => {
    setFormError(null);

    if (!formData.date) {
      setFormError("অনুগ্রহ করে তারিখ নির্বাচন করুন।");
      return;
    }

    const count = parseInt(formData.count) || 0;
    const advance = parseInt(formData.advance) || 0;
    const extraLeave = parseInt(formData.extraLeave) || 0;

    if (count === 0 && advance === 0 && extraLeave === 0) {
      setFormError("ডেলিভারি, অগ্রিম বা ছুটির মধ্যে অন্তত একটি তথ্য দিন।");
      return;
    }

    if (count < 0 || advance < 0 || extraLeave < 0) {
      setFormError("নেগেটিভ ভ্যালু গ্রহণযোগ্য নয়।");
      return;
    }

    const entry: any = {
      uid: user?.uid,
      date: formData.date,
      count,
      advance,
      extraLeave,
      createdAt: new Date().toISOString()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'logs', editingId), entry);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'logs'), entry);
      }
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        count: '',
        advance: '',
        extraLeave: ''
      });
    } catch (error) {
      console.error("Log Submit Error:", error);
      setFormError("ডেটা সেভ করতে সমস্যা হয়েছে।");
    }
  };

  const handleEdit = (log: LogEntry) => {
    setConfirmModal({
      show: true,
      title: "ইডিট নিশ্চিত করুন",
      message: `${format(parseISO(log.date), 'dd MMMM')} এর তথ্য কি ইডিট করতে চান?`,
      type: 'edit',
      onConfirm: () => {
        setEditingId(log.id);
        setFormData({
          date: log.date,
          count: log.count.toString(),
          advance: log.advance.toString(),
          extraLeave: log.extraLeave.toString()
        });
        // Scroll to the input form inside the mockup container
        const appBody = document.querySelector('.overflow-y-auto');
        if (appBody) {
          appBody.scrollTo({ top: 0, behavior: 'smooth' });
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const handleDelete = (id: string) => {
    const logToDelete = logs.find(l => l.id === id);
    if (!logToDelete) return;

    setConfirmModal({
      show: true,
      title: "ডিলিট নিশ্চিত করুন",
      message: `${format(parseISO(logToDelete.date), 'dd MMMM')} এর সকল তথ্য কি স্থায়ীভাবে মুছে ফেলতে চান?`,
      type: 'delete',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'logs', id));
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          console.error("Delete Error:", error);
        }
      }
    });
  };

  const exportCSV = () => {
    const headers = ["Date", "Deliveries", "Advance", "ExtraLeave"];
    const rows = logs.map(log => [log.date, log.count, log.advance, log.extraLeave]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `delivery_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- UI Components ---
  const Card = ({ children, className, title, icon: Icon }: { children: React.ReactNode; className?: string; title?: string; icon?: any }) => (
    <div className={cn("bg-surface rounded-3xl p-5 border border-white/5 mb-5", className)}>
      {title && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-neon-blue" />}
            <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">{title}</h3>
          </div>
        </div>
      )}
      {children}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center md:p-4 overflow-hidden relative">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="decorative-circle absolute w-[500px] h-[500px] -top-[100px] -left-[200px]" />
        <div className="hidden lg:block absolute right-20 top-[20%] w-72">
          <div className="bg-neon-purple text-white px-3 py-1 rounded-full text-[10px] font-bold inline-block mb-5 uppercase tracking-widest">
            COMMANDER v4.2
          </div>
          <h1 className="text-4xl font-display font-black text-white mb-2 leading-tight">
            Cyber Rider<br />
            <span className="text-neon-blue">Pro Edition</span>
          </h1>
          <p className="text-text-dim text-sm leading-relaxed">
            অত্যাধুনিক AI চালিত ডেলিভারি এবং স্যালারি ম্যানেজমেন্ট সিস্টেম। 
            আপনার দৈনন্দিন লক্ষ্য অর্জন করুন এবং রিয়েল-টাইম অ্যানালিটিক্স দেখুন।
          </p>
        </div>
      </div>

      {/* Main Container - Mockup on Desktop, Full screen on Mobile */}
      <div 
        className="w-full h-[100dvh] md:max-w-[380px] md:h-[720px] bg-bg-dark md:border-[8px] md:border-[#1a1a1a] md:rounded-[40px] md:mockup-shadow relative flex flex-col overflow-hidden z-10"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)'
        }}
      >
        {/* Status Bar - Only visible on Desktop Mockup */}
        <div className="hidden md:flex h-10 px-6 justify-between items-end text-[10px] text-text-dim font-mono pb-1">
          <div className="flex items-center gap-2">
            <span>{format(new Date(), 'HH:mm')}</span>
            <div className="flex items-center gap-1">
              {syncStatus === 'syncing' && <RefreshCw className="w-2.5 h-2.5 animate-spin text-neon-blue" />}
              {syncStatus === 'synced' && <CheckCircle2 className="w-2.5 h-2.5 text-neon-green" />}
              {syncStatus === 'offline' && <CloudOff className="w-2.5 h-2.5 text-neon-red" />}
              {syncStatus === 'pending' && <Cloud className="w-2.5 h-2.5 text-neon-blue animate-pulse" />}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span>5G</span>
            <span className="text-xs">📶</span>
            <span className="text-xs">🔋</span>
            <span>98%</span>
          </div>
        </div>

        <AnimatePresence>
          {(!isSystemInitialized || isAuthLoading || !user) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-bg-dark/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.div 
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 4, repeat: Infinity }}
                className="mb-8"
              >
                <Rocket className="w-16 h-16 text-neon-blue drop-shadow-[0_0_15px_rgba(0,243,255,0.5)]" />
              </motion.div>
              
              <h2 className="text-2xl font-display font-black text-white mb-2 glow-blue uppercase tracking-tighter">
                {!user ? 'Authentication Required' : 'System Offline'}
              </h2>
              <p className="text-text-dim text-xs mb-8 leading-relaxed">
                {!user 
                  ? 'আপনার ডেটা ক্লাউডে সুরক্ষিত রাখতে গুগল দিয়ে লগইন করুন।' 
                  : 'সিস্টেমের অডিও এবং রিয়েল-টাইম অ্যালার্ট সক্রিয় করতে নিচে ক্লিক করুন।'}
              </p>
              
              {!user ? (
                <button 
                  onClick={handleLogin}
                  className="group relative px-8 py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="Google" />
                  Login with Google
                </button>
              ) : (
                <button 
                  onClick={initializeSystem}
                  className="group relative px-8 py-4 bg-neon-blue text-black font-black uppercase tracking-widest rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-all"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Initialize System <Zap className="w-4 h-4" />
                  </span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navbar */}
        <nav className="h-16 flex items-center justify-between px-6 shrink-0 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-neon-blue" />
            <span className="font-display font-black text-lg glow-blue tracking-tighter">DEL-PRO AI</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="w-8 h-8 bg-white/5 rounded-lg flex flex-col justify-center items-center gap-1 group"
          >
            <span className="w-4.5 h-0.5 bg-neon-blue group-hover:w-5 transition-all" />
            <span className="w-4.5 h-0.5 bg-neon-blue group-hover:w-5 transition-all" />
            <span className="w-4.5 h-0.5 bg-neon-blue group-hover:w-5 transition-all" />
          </button>
        </nav>

        {/* Scrollable App Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-10 scrollbar-hide">
          <header className="mb-6 mt-2 flex items-center gap-4">
            <div className="relative">
              <img 
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${settings.userAvatar}`} 
                alt="Avatar" 
                className="w-12 h-12 rounded-xl bg-neon-blue/10 border border-neon-blue/30 p-1"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-neon-green rounded-full border-2 border-bg-dark" />
            </div>
            <div>
              <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest leading-none mb-1">স্বাগতম, {settings.userRole}</p>
              <h2 className="text-xl font-display font-bold text-white leading-none">{settings.userName}</h2>
            </div>
          </header>

          {/* AI Insight Card */}
          <div 
            onClick={() => setShowAiChat(true)}
            className="ai-card-gradient border-neon-purple rounded-2xl p-4 mb-5 relative overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-95 transition-all"
          >
            <div className="absolute top-4 right-4 text-xl">
              {isInsightLoading ? <Loader2 className="w-5 h-5 animate-spin text-neon-purple" /> : '🤖'}
            </div>
            <span className="text-[10px] font-bold uppercase text-neon-purple mb-2 block tracking-widest">AI Smart Assistant</span>
            <p className="text-xs leading-relaxed text-[#d1d1d1]">
              {dynamicAiInsight}
            </p>
          </div>

          {/* Target Progress */}
          <div className="bg-surface rounded-3xl p-5 border border-white/5 mb-5">
            <div className="flex justify-between items-center mb-3 text-sm">
              <span className="font-bold flex items-center gap-1">🎯 মাসিক লক্ষ্য</span>
              <span className="text-neon-blue font-mono font-bold">{stats.totalDel} / {settings.target}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((stats.totalDel / settings.target) * 100, 100)}%` }}
                className="h-full bg-gradient-to-r from-neon-blue to-neon-purple shadow-[0_0_10px_var(--color-neon-blue)]"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-3 bg-black/20 rounded-xl border border-white/5">
                <span className="text-[9px] text-text-dim uppercase block mb-1">ডেলিভারি</span>
                <span className="text-sm font-bold text-neon-blue">{stats.totalDel}</span>
              </div>
              <div className="text-center p-3 bg-black/20 rounded-xl border border-white/5">
                <span className="text-[9px] text-text-dim uppercase block mb-1">অগ্রিম</span>
                <span className="text-sm font-bold text-neon-purple">{stats.totalAdv}৳</span>
              </div>
              <div className="text-center p-3 bg-black/20 rounded-xl border border-white/5">
                <span className="text-[9px] text-text-dim uppercase block mb-1">জরিমানা</span>
                <span className="text-sm font-bold text-neon-red">{stats.fine}৳</span>
              </div>
            </div>
          </div>

          {/* Input Form */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className={cn(
              "bg-white/5 border rounded-xl p-3 transition-colors",
              formError && !formData.date ? "border-neon-red/50 bg-neon-red/5" : "border-neon-blue/20"
            )}>
              <label className="text-[9px] font-bold uppercase text-text-dim block mb-1">Date</label>
              <input 
                type="date" 
                value={formData.date}
                onChange={(e) => {
                  setFormError(null);
                  setFormData(f => ({ ...f, date: e.target.value }));
                }}
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
            <div className={cn(
              "bg-white/5 border rounded-xl p-3 transition-colors",
              formError && (parseInt(formData.count) || 0) === 0 && (parseInt(formData.advance) || 0) === 0 && (parseInt(formData.extraLeave) || 0) === 0 ? "border-neon-red/50 bg-neon-red/5" : "border-neon-blue/20"
            )}>
              <label className="text-[9px] font-bold uppercase text-text-dim block mb-1">Delivery</label>
              <input 
                type="number" 
                placeholder="0"
                value={formData.count}
                onChange={(e) => {
                  setFormError(null);
                  setFormData(f => ({ ...f, count: e.target.value }));
                }}
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
            <div className={cn(
              "bg-white/5 border rounded-xl p-3 transition-colors",
              formError && (parseInt(formData.count) || 0) === 0 && (parseInt(formData.advance) || 0) === 0 && (parseInt(formData.extraLeave) || 0) === 0 ? "border-neon-red/50 bg-neon-red/5" : "border-neon-blue/20"
            )}>
              <label className="text-[9px] font-bold uppercase text-text-dim block mb-1">Advance</label>
              <input 
                type="number" 
                placeholder="0"
                value={formData.advance}
                onChange={(e) => {
                  setFormError(null);
                  setFormData(f => ({ ...f, advance: e.target.value }));
                }}
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
            <div className={cn(
              "bg-white/5 border rounded-xl p-3 transition-colors",
              formError && (parseInt(formData.count) || 0) === 0 && (parseInt(formData.advance) || 0) === 0 && (parseInt(formData.extraLeave) || 0) === 0 ? "border-neon-red/50 bg-neon-red/5" : "border-neon-blue/20"
            )}>
              <label className="text-[9px] font-bold uppercase text-text-dim block mb-1">Leave</label>
              <input 
                type="number" 
                placeholder="0"
                value={formData.extraLeave}
                onChange={(e) => {
                  setFormError(null);
                  setFormData(f => ({ ...f, extraLeave: e.target.value }));
                }}
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
            <button 
              onClick={handleSaveEntry}
              className="col-span-2 bg-neon-blue text-black font-extrabold uppercase tracking-widest py-4 rounded-xl text-xs shadow-[0_5px_15px_rgba(0,243,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
            >
              {editingId ? 'Update Data' : 'Save Data'}
            </button>
            {formError && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="col-span-2 text-[10px] text-neon-red font-bold text-center mt-2"
              >
                ⚠️ {formError}
              </motion.p>
            )}
          </div>

          {/* Net Salary Display */}
          <div className="text-center mb-5">
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-[10px] outline-none mb-2"
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const d = subMonths(new Date(), i);
                const val = format(d, 'yyyy-MM');
                return <option key={val} value={val} className="bg-bg-dark">{format(d, 'MMMM yyyy')}</option>;
              })}
            </select>
            <p className="text-[10px] font-bold uppercase text-text-dim">Net Salary Estimate</p>
            <h2 className="text-4xl font-display font-black glow-blue my-2 tracking-tighter">
              {stats.netSalary.toLocaleString()} ৳
            </h2>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neon-blue/10 border border-neon-blue/20 text-neon-blue text-[9px] font-bold uppercase">
              Bonus: {stats.bonus} ৳
            </div>
          </div>

          {/* Performance Chart Placeholder Look */}
          <div className="bg-white/5 h-24 rounded-2xl border border-white/10 border-dashed flex items-end gap-2 p-3 mb-5">
            {chartData.map((d, i) => (
              <div 
                key={i} 
                className={cn(
                  "flex-1 bg-neon-blue rounded-t-lg transition-all duration-500",
                  i === chartData.length - 1 ? "opacity-100 bg-neon-purple" : "opacity-40"
                )}
                style={{ height: `${Math.max((d.count / (settings.target / 4)) * 100, 10)}%` }}
              />
            ))}
          </div>

          {/* Delivery Table */}
          <Card title="Delivery Logs" icon={Package}>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-text-dim border-b border-white/5">
                    <th className="text-left pb-2 px-2 font-bold uppercase tracking-wider">Date</th>
                    <th className="text-center pb-2 px-2 font-bold uppercase tracking-wider">Count</th>
                    <th className="text-center pb-2 px-2 font-bold uppercase tracking-wider">Amount</th>
                    <th className="text-right pb-2 px-2 font-bold uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredLogs.filter(l => l.count > 0).sort((a,b) => b.date.localeCompare(a.date)).map((log, idx) => (
                    <tr key={log.id} className={cn("group transition-colors", idx % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.05]")}>
                      <td className="py-3 px-2 font-mono text-text-dim">{format(parseISO(log.date), 'dd/MM')}</td>
                      <td className="py-3 px-2 text-center font-bold text-neon-blue">{log.count}</td>
                      <td className="py-3 px-2 text-center font-bold text-neon-blue">{log.count * settings.deliveryRate}৳</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => handleEdit(log)} className="p-1.5 bg-white/5 rounded-lg hover:text-neon-blue transition-colors">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDelete(log.id)} className="p-1.5 bg-white/5 rounded-lg hover:text-neon-red transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.filter(l => l.count > 0).length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-text-dim italic">No delivery logs.</td>
                    </tr>
                  )}
                </tbody>
                {filteredLogs.filter(l => l.count > 0).length > 0 && (
                  <tfoot className="border-t-2 border-neon-blue/20">
                    <tr className="bg-neon-blue/5">
                      <td className="py-3 px-2 font-bold uppercase text-neon-blue">Total</td>
                      <td className="py-3 px-2 text-center font-bold text-neon-blue">{stats.totalDel}</td>
                      <td className="py-3 px-2 text-center font-bold text-neon-blue">{stats.totalDel * settings.deliveryRate}৳</td>
                      <td className="py-3 px-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* Advance Table */}
          <Card title="Advance Logs" icon={CreditCard}>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-text-dim border-b border-white/5">
                    <th className="text-left pb-2 px-2 font-bold uppercase tracking-wider">Date</th>
                    <th className="text-center pb-2 px-2 font-bold uppercase tracking-wider">Amount</th>
                    <th className="text-right pb-2 px-2 font-bold uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredLogs.filter(l => l.advance > 0).sort((a,b) => b.date.localeCompare(a.date)).map((log, idx) => (
                    <tr key={log.id} className={cn("group transition-colors", idx % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.05]")}>
                      <td className="py-3 px-2 font-mono text-text-dim">{format(parseISO(log.date), 'dd/MM')}</td>
                      <td className="py-3 px-2 text-center font-bold text-neon-purple">{log.advance}৳</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => handleEdit(log)} className="p-1.5 bg-white/5 rounded-lg hover:text-neon-blue transition-colors">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDelete(log.id)} className="p-1.5 bg-white/5 rounded-lg hover:text-neon-red transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.filter(l => l.advance > 0).length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-text-dim italic">No advance logs.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Fines/Leave Table */}
          <Card title="Fine Logs" icon={AlertTriangle}>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-text-dim border-b border-white/5">
                    <th className="text-left pb-2 px-2 font-bold uppercase tracking-wider">Date</th>
                    <th className="text-center pb-2 px-2 font-bold uppercase tracking-wider">Fine</th>
                    <th className="text-right pb-2 px-2 font-bold uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredLogs.filter(l => l.extraLeave > 0).sort((a,b) => b.date.localeCompare(a.date)).map((log, idx) => (
                    <tr key={log.id} className={cn("group transition-colors", idx % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.05]")}>
                      <td className="py-3 px-2 font-mono text-text-dim">{format(parseISO(log.date), 'dd/MM')}</td>
                      <td className="py-3 px-2 text-center font-bold text-neon-red">{Math.round(log.extraLeave * (settings.baseSalary / 30))}৳</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => handleEdit(log)} className="p-1.5 bg-white/5 rounded-lg hover:text-neon-blue transition-colors">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDelete(log.id)} className="p-1.5 bg-white/5 rounded-lg hover:text-neon-red transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.filter(l => l.extraLeave > 0).length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-text-dim italic">No fine logs.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* AI Chat Interface */}
      <AnimatePresence>
        {showAiChat && (
          <AIChat 
            logs={logs} 
            settings={settings} 
            onClose={() => setShowAiChat(false)} 
          />
        )}
      </AnimatePresence>

      {/* Sidebar (Full screen overlay for mockup) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="absolute inset-0 bg-bg-dark z-[70] p-8 overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="font-display font-bold text-2xl glow-blue uppercase">Settings</h2>
              <button onClick={() => setIsSidebarOpen(false)}><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-6">
              {/* Settings Navigation List */}
              {!activeSettingsSection ? (
                <div className="space-y-3">
                  {/* Profile/General section is now the first list item */}
                  <button 
                    onClick={() => setActiveSettingsSection('profile')}
                    className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-neon-blue/5 hover:border-neon-blue/20 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-neon-blue/10 rounded-lg flex items-center justify-center">
                        <User className="w-4 h-4 text-neon-blue" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white">Profile & Designation</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-neon-blue transition-colors" />
                  </button>
                  <button 
                    onClick={() => setActiveSettingsSection('salary')}
                    className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-neon-blue/5 hover:border-neon-blue/20 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-neon-blue/10 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-neon-blue" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white">Salary Configuration</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-neon-blue transition-colors" />
                  </button>

                  <button 
                    onClick={() => setActiveSettingsSection('target')}
                    className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-neon-blue/5 hover:border-neon-blue/20 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-neon-blue/10 rounded-lg flex items-center justify-center">
                        <Target className="w-4 h-4 text-neon-blue" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white">Monthly Target</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-neon-blue transition-colors" />
                  </button>

                  <button 
                    onClick={() => setActiveSettingsSection('holiday')}
                    className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-neon-purple/5 hover:border-neon-purple/20 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-neon-purple/10 rounded-lg flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-neon-purple" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white">Holiday Settings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-neon-purple transition-colors" />
                  </button>

                  <button 
                    onClick={() => setActiveSettingsSection('backup')}
                    className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-neon-blue/5 hover:border-neon-blue/20 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-neon-blue/10 rounded-lg flex items-center justify-center">
                        <Cloud className="w-4 h-4 text-neon-blue" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white">Google Drive Backup</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-neon-blue transition-colors" />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <button 
                    onClick={() => setActiveSettingsSection(null)}
                    className="flex items-center gap-2 text-text-dim hover:text-white mb-2 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Back to Menu</span>
                  </button>

                  {activeSettingsSection === 'profile' && (
                    <div className="glass border-white/5 p-6 rounded-[2rem]">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-neon-blue mb-6">Profile Settings</h3>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="relative">
                          <img 
                            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${settings.userAvatar}`} 
                            alt="Avatar" 
                            className="w-16 h-16 rounded-2xl bg-neon-blue/10 border border-neon-blue/30 p-1"
                            referrerPolicy="no-referrer"
                          />
                          <button 
                            onClick={() => setSettings(s => ({ ...s, userAvatar: Math.random().toString(36).substring(7) }))}
                            className="absolute -bottom-1 -right-1 bg-neon-blue text-black p-1 rounded-lg shadow-lg hover:scale-110 transition-transform"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-lg text-white leading-none">{settings.userName}</h3>
                          <p className="text-[10px] text-neon-blue font-bold uppercase tracking-widest mt-1">{settings.userRole}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-1.5 block">Full Name</label>
                          <input 
                            type="text" 
                            value={settings.userName}
                            onChange={(e) => {
                              setSettingsError(null);
                              setSettings(s => ({ ...s, userName: e.target.value }));
                            }}
                            className={cn(
                              "w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm outline-none transition-colors",
                              settingsError && !settings.userName.trim() ? "border-neon-red/50 focus:border-neon-red" : "border-white/10 focus:border-neon-blue/50"
                            )}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-1.5 block">Role / Designation</label>
                          <input 
                            type="text" 
                            value={settings.userRole}
                            onChange={(e) => setSettings(s => ({ ...s, userRole: e.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-neon-blue/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-1.5 block">Bio</label>
                          <textarea 
                            value={settings.userBio}
                            onChange={(e) => setSettings(s => ({ ...s, userBio: e.target.value }))}
                            rows={2}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-neon-blue/50 transition-colors resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsSection === 'salary' && (
                    <div className="glass border-white/5 p-6 rounded-[2rem]">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-neon-blue mb-4">Salary Configuration</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-1.5 block">Base Salary (৳)</label>
                          <input 
                            type="number" 
                            value={settings.baseSalary}
                            onChange={(e) => setSettings(s => ({ ...s, baseSalary: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-neon-blue/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-1.5 block">Delivery Rate (৳ per order)</label>
                          <input 
                            type="number" 
                            value={settings.deliveryRate}
                            onChange={(e) => setSettings(s => ({ ...s, deliveryRate: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-neon-blue/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-1.5 block">Leave Fine (Auto-calculated)</label>
                          <div className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-neon-red font-bold">
                            {Math.round(settings.baseSalary / 30)} ৳ <span className="text-[10px] text-text-dim font-normal">(Salary / 30 per day)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsSection === 'target' && (
                    <div className="space-y-6">
                      <div className="glass border-white/5 p-6 rounded-[2rem]">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-neon-blue mb-4">Performance Goal</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-2 block">Monthly Target Count</label>
                            <input 
                              type="number" 
                              value={settings.target}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (val < 0) return;
                                setSettingsError(null);
                                setSettings(s => ({ ...s, target: val || 0 }));
                              }}
                              className={cn(
                                "w-full bg-white/5 border rounded-xl px-4 py-3 text-sm outline-none transition-all",
                                settingsError && settings.target <= 0 ? "border-neon-red/50 focus:border-neon-red" : "border-white/10 focus:border-neon-blue"
                              )}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-2 block">Shift Start Time</label>
                            <input 
                              type="time" 
                              value={settings.shiftTime}
                              onChange={(e) => setSettings(s => ({ ...s, shiftTime: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-neon-blue"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsSection === 'holiday' && (
                    <div className="glass border-white/5 p-6 rounded-[2rem]">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-neon-purple mb-4">Holiday Settings 🗓️</h3>
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim block">Add Official Holiday Range (Eid, Puja, Xmas etc.)</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] font-bold uppercase text-text-dim mb-1 block">From</label>
                              <input 
                                type="date" 
                                id="holiday-start-date"
                                className="w-full bg-white/5 border border-white/30 rounded-xl px-3 py-2 text-[10px] outline-none focus:border-neon-purple/50 transition-colors"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-bold uppercase text-text-dim mb-1 block">To (Optional)</label>
                              <input 
                                type="date" 
                                id="holiday-end-date"
                                className="w-full bg-white/5 border border-white/30 rounded-xl px-3 py-2 text-[10px] outline-none focus:border-neon-purple/50 transition-colors"
                              />
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              const startInput = document.getElementById('holiday-start-date') as HTMLInputElement;
                              const endInput = document.getElementById('holiday-end-date') as HTMLInputElement;
                              const start = startInput.value;
                              const end = endInput.value || start;
                              
                              if (start) {
                                const startDate = parseISO(start);
                                const endDate = parseISO(end);
                                
                                try {
                                  const days = eachDayOfInterval({ start: startDate, end: endDate });
                                  const newDates = days.map(d => format(d, 'yyyy-MM-dd'));
                                  
                                  setSettings(s => ({
                                    ...s,
                                    holidays: Array.from(new Set([...(s.holidays || []), ...newDates])).sort()
                                  }));
                                  
                                  startInput.value = '';
                                  endInput.value = '';
                                } catch (e) {
                                  console.error("Invalid interval", e);
                                }
                              }
                            }}
                            className="w-full bg-neon-purple text-white py-2.5 rounded-xl text-xs font-bold shadow-[0_0_20px_rgba(188,19,254,0.3)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                          >
                            <Plus className="w-4 h-4" /> Add Holiday Range
                          </button>
                        </div>
                        
                        {(settings.holidays || []).length > 0 && (
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                            {settings.holidays.map(hStr => (
                              <div key={hStr} className="flex justify-between items-center bg-white/5 border border-white/5 px-3 py-2 rounded-lg group">
                                <span className="text-[10px] font-mono font-bold text-neon-purple">{format(parseISO(hStr), 'dd MMMM yyyy')}</span>
                                <button 
                                  onClick={() => setSettings(s => ({ ...s, holidays: s.holidays.filter(h => h !== hStr) }))}
                                  className="text-white/30 hover:text-neon-red transition-colors group-hover:opacity-100"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-[9px] text-text-dim italic">
                          💡 নির্ধারিত ছুটির দিনে কোনো জরিমানা করা হবে না।
                        </p>
                      </div>
                    </div>
                  )}

                  {activeSettingsSection === 'backup' && (
                    <div className="space-y-4">
                      {/* Google Drive Backup */}
                      <div className="glass border-white/5 p-6 rounded-[2rem]">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-neon-purple/20 rounded-xl flex items-center justify-center">
                            <Cloud className="w-6 h-6 text-neon-purple" />
                          </div>
                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-neon-purple leading-none">Google Drive Backup</h3>
                            <p className="text-[9px] text-text-dim mt-1">Snapshot your data to the cloud</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-text-dim">Last Backup</span>
                              <span className="text-[9px] font-mono text-neon-purple">
                                {settings.lastBackupSize || '0 KB'}
                              </span>
                            </div>
                            <p className="text-[11px] text-white font-medium">
                              {settings.lastBackupDate 
                                ? format(parseISO(settings.lastBackupDate), 'PPp') 
                                : 'Never backed up'}
                            </p>
                            
                            <div className="grid grid-cols-2 gap-2 mt-4">
                              <button 
                                onClick={() => {
                                  if (!isGoogleAuthenticated) {
                                    alert("গুগল ড্রাইভ কানেক্ট করা নেই। অনুগ্রহ করে নিচে 'Connect Google Drive' বাটনে ক্লিক করে কানেক্ট করুন।");
                                    return;
                                  }
                                  backupToGoogleDrive();
                                }}
                                disabled={isBackingUp}
                                className="py-2.5 bg-neon-purple text-black font-black uppercase tracking-widest text-[9px] rounded-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5"
                              >
                                {isBackingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                                Back Up
                              </button>
                              <button 
                                onClick={() => {
                                  if (!isGoogleAuthenticated) {
                                    alert("গুগল ড্রাইভ কানেক্ট করা নেই। অনুগ্রহ করে নিচে 'Connect Google Drive' বাটনে ক্লিক করে কানেক্ট করুন।");
                                    return;
                                  }
                                  restoreFromGoogleDrive();
                                }}
                                className="py-2.5 bg-white/5 border border-white/10 text-white font-bold uppercase tracking-wider text-[9px] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Restore
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3 px-1">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim">Frequency</label>
                              <select 
                                value={settings.autoBackup}
                                onChange={(e) => setSettings(s => ({ ...s, autoBackup: e.target.value as any }))}
                                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white outline-none focus:border-neon-purple/50"
                              >
                                <option value="never">Never</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                              </select>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-white/5">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim">Account</label>
                              <span className="text-[9px] text-neon-blue truncate max-w-[100px] text-right">
                                {isGoogleAuthenticated ? (user?.email || 'Connected') : 'Not connected'}
                              </span>
                            </div>
                            
                            {!isGoogleAuthenticated ? (
                              <button 
                                onClick={connectGoogleDrive}
                                className="w-full py-2 border border-dashed border-neon-blue/40 text-neon-blue text-[9px] font-bold uppercase rounded-xl hover:bg-neon-blue/5 transition-all mt-2"
                              >
                                Connect Google Drive
                              </button>
                            ) : (
                              <button 
                                onClick={() => {
                                  setConfirmModal({
                                    show: true,
                                    title: 'Repair Sync? 🛠️',
                                    message: 'এর মাধ্যমে আপনার গুগল কানেকশন রিসেট করা হবে। এটি সিংক্রোনাইজেশন সমস্যা সমাধানে সাহায্য করে। আপনি কি নিশ্চিত?',
                                    onConfirm: () => {
                                      setIsGoogleAuthenticated(false);
                                      setGoogleTokens(null);
                                      localStorage.removeItem('google_tokens');
                                      setConfirmModal(prev => ({ ...prev, show: false }));
                                      setTimeout(connectGoogleDrive, 500);
                                    },
                                    type: 'delete'
                                  });
                                }}
                                className="w-full py-2 border border-dashed border-neon-red/40 text-neon-red text-[9px] font-bold uppercase rounded-xl hover:bg-neon-red/5 transition-all mt-2"
                              >
                                Repair Sync Connection
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Local Backup Fallback */}
                      <div className="glass border-white/5 p-6 rounded-[2rem]">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-neon-green/20 rounded-xl flex items-center justify-center">
                            <Download className="w-6 h-6 text-neon-green" />
                          </div>
                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-neon-green leading-none">Local Backup</h3>
                            <p className="text-[9px] text-text-dim mt-1">Export data to your device</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={exportLocalBackup}
                            className="py-2.5 bg-neon-green/10 border border-neon-green/30 text-neon-green font-black uppercase tracking-widest text-[9px] rounded-xl hover:bg-neon-green/20 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export
                          </button>
                          <label className="py-2.5 bg-white/5 border border-white/10 text-white font-bold uppercase tracking-wider text-[10px] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                            <Plus className="w-3.5 h-3.5" />
                            Import
                            <input type="file" accept=".json" onChange={importLocalBackup} className="hidden" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-8 space-y-4 border-t border-white/5 mt-6">
                <div className="glass border-white/5 p-4 rounded-2xl mb-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase text-text-dim">Real-time Sync</span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                      syncStatus === 'synced' ? "bg-neon-green/20 text-neon-green" :
                      syncStatus === 'syncing' ? "bg-neon-blue/20 text-neon-blue" :
                      syncStatus === 'offline' ? "bg-neon-red/20 text-neon-red" :
                      "bg-white/10 text-white"
                    )}>
                      {syncStatus}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-dim mb-3">
                    {lastSynced ? `Last synced: ${format(parseISO(lastSynced), 'PPp')}` : 'Never synced'}
                  </p>
                  <button 
                    disabled={!isOnline || syncStatus === 'syncing'}
                    onClick={syncWithCloud}
                    className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase hover:bg-white/10 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={cn("w-3 h-3", syncStatus === 'syncing' && "animate-spin")} />
                    Sync Now
                  </button>
                </div>

                <div className="glass border-white/5 p-4 rounded-2xl mb-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase text-text-dim">Notifications</span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                      notificationPermission === 'granted' ? "bg-neon-green/20 text-neon-green" :
                      notificationPermission === 'denied' ? "bg-neon-red/20 text-neon-red" :
                      "bg-white/10 text-white"
                    )}>
                      {notificationPermission}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-dim mb-3">
                    {notificationPermission === 'granted' 
                      ? 'System alerts are enabled for your device.' 
                      : 'Enable alerts for shift reminders and targets.'}
                  </p>
                  <button 
                    disabled={notificationPermission === 'granted'}
                    onClick={requestNotificationPermission}
                    className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase hover:bg-white/10 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {notificationPermission === 'granted' ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                    {notificationPermission === 'granted' ? 'Alerts Active' : 'Enable Alerts'}
                  </button>
                </div>

                <div className="glass border-white/5 p-4 rounded-2xl mb-2">
                  <div className="flex items-center gap-2 mb-4">
                    <Volume2 className="w-4 h-4 text-neon-blue" />
                    <span className="text-[10px] font-bold uppercase text-text-dim">Alert Sound & Volume</span>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-text-dim mb-2 block uppercase tracking-widest">Select Sound</label>
                      <select 
                        value={settings.notificationSound}
                        onChange={(e) => setSettings(s => ({ ...s, notificationSound: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-neon-blue/50"
                      >
                        <option value="synth">Neon Synth (Internal)</option>
                        <option value="https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3">Futuristic Beep</option>
                        <option value="https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3">Cyber Alert</option>
                        <option value="https://assets.mixkit.co/active_storage/sfx/2565/2565-preview.mp3">Digital Chime</option>
                      </select>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-[10px] text-text-dim uppercase tracking-widest">Volume</label>
                        <span className="text-[10px] text-neon-blue font-bold">{Math.round(settings.notificationVolume * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.1"
                        value={settings.notificationVolume}
                        onChange={(e) => setSettings(s => ({ ...s, notificationVolume: parseFloat(e.target.value) }))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon-blue"
                      />
                    </div>

                    <button 
                      onClick={playNotificationSound}
                      className="w-full py-2 bg-neon-blue/10 border border-neon-blue/30 rounded-xl text-[10px] font-bold uppercase text-neon-blue hover:bg-neon-blue/20 transition-all mb-2"
                    >
                      Test Sound
                    </button>

                    <button 
                      onClick={() => {
                        setSettings(s => ({ 
                          ...s, 
                          notificationSound: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
                          notificationVolume: 0.5
                        }));
                        setConfirmModal({
                          show: true,
                          title: 'Settings Reset ⚡',
                          message: 'অডিও সেটিংস ডিফল্টে রিসেট করা হয়েছে।',
                          onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false })),
                          type: 'info'
                        });
                      }}
                      className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase text-text-dim hover:text-white transition-all"
                    >
                      Reset Sound to Defaults
                    </button>
                  </div>
                </div>

                <div className="glass border-white/5 p-4 rounded-2xl mb-2">
                  <div className="flex items-center gap-2 mb-4">
                    <HardDrive className="w-4 h-4 text-neon-green" />
                    <span className="text-[10px] font-bold uppercase text-text-dim">Google Drive Backup</span>
                  </div>
                  
                  <p className="text-[10px] text-text-dim mb-4">
                    আপনার সকল ডেটা নিরাপদ রাখতে গুগল ড্রাইভে ব্যাকআপ রাখুন।
                  </p>

                  {!isGoogleAuthenticated ? (
                    <button 
                      onClick={connectGoogleDrive}
                      className="w-full py-3 bg-white text-black font-bold rounded-xl text-xs uppercase hover:bg-white/90 transition-all flex items-center justify-center gap-2"
                    >
                      <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-4 h-4" alt="Google" />
                      Connect Google Drive
                    </button>
                  ) : (
                    <button 
                      disabled={isBackingUp}
                      onClick={backupToGoogleDrive}
                      className="w-full py-3 bg-neon-green/20 border border-neon-green/40 text-neon-green font-bold rounded-xl text-xs uppercase hover:bg-neon-green/30 transition-all flex items-center justify-center gap-2"
                    >
                      {isBackingUp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                      {isBackingUp ? "Backing up..." : "Backup Now to Drive"}
                    </button>
                  )}
                </div>

                <button 
                  onClick={() => setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
                  className="w-full flex items-center justify-between bg-white/5 border border-white/10 px-4 py-4 rounded-2xl hover:bg-white/10 transition-colors"
                >
                  <span>Theme</span>
                  {settings.theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>

                <button 
                  onClick={exportCSV}
                  className="w-full flex items-center justify-between bg-neon-purple/20 border border-neon-purple/40 px-4 py-4 rounded-2xl hover:bg-neon-purple/30 transition-colors"
                >
                  <span>Export CSV Report</span>
                  <Download className="w-5 h-5" />
                </button>

                <button 
                  onClick={handleSidebarLogout}
                  className="w-full flex items-center justify-between bg-neon-red/10 border border-neon-red/30 px-4 py-4 rounded-2xl hover:bg-neon-red/20 transition-colors text-neon-red font-bold"
                >
                  <span>Logout</span>
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={cn(
                "max-w-md w-full glass p-8 rounded-[2.5rem] shadow-2xl border-2",
                confirmModal.type === 'delete' ? "border-neon-red shadow-neon-red/20" : "border-neon-blue shadow-neon-blue/20"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border",
                confirmModal.type === 'delete' ? "bg-neon-red/10 border-neon-red/50 text-neon-red" : 
                confirmModal.type === 'setup' ? "bg-neon-purple/10 border-neon-purple/50 text-neon-purple" :
                "bg-neon-blue/10 border-neon-blue/50 text-neon-blue"
              )}>
                {confirmModal.type === 'delete' ? <Trash2 className="w-8 h-8" /> : 
                 confirmModal.type === 'setup' ? <Settings className="w-8 h-8" /> :
                 <Edit2 className="w-8 h-8" />}
              </div>
              
              <h2 className={cn(
                "text-2xl font-display font-black uppercase mb-4 tracking-tight",
                confirmModal.type === 'delete' ? "text-neon-red" : 
                confirmModal.type === 'setup' ? "text-neon-purple" :
                "text-neon-blue"
              )}>
                {confirmModal.title}
              </h2>
              
              <p className="text-sm leading-relaxed mb-8 text-text-dim">
                {confirmModal.message}
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="bg-white/5 border border-white/10 text-white font-bold py-3 rounded-2xl hover:bg-white/10 transition-all"
                >
                  বাতিল
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className={cn(
                    "text-black font-bold py-3 rounded-2xl shadow-lg hover:scale-105 transition-all",
                    confirmModal.type === 'delete' ? "bg-neon-red" : 
                    confirmModal.type === 'setup' ? "bg-neon-purple" :
                    "bg-neon-blue"
                  )}
                >
                  {confirmModal.type === 'setup' ? 'গাইড দেখুন' : 'নিশ্চিত করুন'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Shift Overlay */}
      <AnimatePresence>
        {aiOverlay.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full glass border-2 border-neon-purple p-10 rounded-[2rem] shadow-[0_0_50px_rgba(188,19,254,0.3)]"
            >
              <div className="w-16 h-16 bg-neon-purple/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-neon-purple/50">
                <AlertTriangle className="w-8 h-8 text-neon-purple animate-bounce" />
              </div>
              <h2 className="text-2xl font-display font-black glow-purple uppercase mb-4">AI কমান্ড সেন্টার</h2>
              <p className="text-base leading-relaxed mb-8 opacity-90">
                {aiOverlay.message}
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-3">
                <button 
                  onClick={() => {
                    setIsShiftActive(true);
                    setAiOverlay({ show: false, message: '', step: 0 });
                  }}
                  className="bg-neon-blue text-black font-bold py-4 rounded-2xl shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:scale-105 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  হ্যাঁ
                </button>
                <button 
                  onClick={() => {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    // Prevent double fine on same day
                    const alreadyFined = logs.some(l => l.date === today && l.extraLeave > 0);
                    
                    if (!alreadyFined) {
                      const fineEntry: any = {
                        uid: user?.uid,
                        date: today,
                        count: 0,
                        advance: 0,
                        extraLeave: 1,
                        createdAt: new Date().toISOString()
                      };
                      addDoc(collection(db, 'logs'), fineEntry).catch(console.error);
                    }
                    
                    setIsShiftActive(true);
                    setAiOverlay({ show: false, message: '', step: 0 });
                  }}
                  className="bg-neon-red text-white font-bold py-4 rounded-2xl shadow-[0_0_20px_rgba(255,0,60,0.2)] hover:scale-105 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" />
                  না
                </button>
              </div>
              <button 
                onClick={() => setAiOverlay({ show: false, message: '', step: 0 })}
                className="w-full bg-white/5 border border-white/10 text-white font-bold py-4 rounded-2xl hover:bg-white/10 transition-all"
              >
                পরে মনে করান
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <div className="fixed top-24 right-4 z-[100] flex flex-col gap-2 pointer-events-none md:top-4">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl min-w-[280px] max-w-sm",
                toast.type === 'error' ? "bg-neon-red/20 border-neon-red/30 text-neon-red ring-1 ring-neon-red/20" :
                toast.type === 'success' ? "bg-neon-green/20 border-neon-green/30 text-neon-green ring-1 ring-neon-green/20" :
                "bg-neon-blue/20 border-neon-blue/30 text-neon-blue ring-1 ring-neon-blue/20"
              )}
            >
              <div className="flex-1 text-[11px] font-bold uppercase tracking-wider">{toast.message}</div>
              <button 
                onClick={() => removeToast(toast.id)}
                className="p-1.5 hover:bg-white/10 rounded-xl transition-colors"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
