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
  HardDrive
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
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths, eachMonthOfInterval } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import { AIChat } from './components/AIChat';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface LogEntry {
  id: string;
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
}

type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline';

// --- Constants ---
const BASE_SALARY = 9000;
const DELIVERY_RATE = 20;
const LEAVE_FINE_RATE = 300;

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
      notificationSound: 'https://cdn.pixabay.com/audio/2022/03/15/audio_78390a3607.mp3', // Futuristic beep
      notificationVolume: 0.5
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
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'delete' | 'edit' | 'info';
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
    } else {
      setSettingsError(null);
      localStorage.setItem('appSettings', JSON.stringify(settings));
    }

    if (settings.theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [settings]);

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

  // --- Sync Logic (Simulated) ---
  const syncWithCloud = useCallback(async () => {
    if (!isOnline || syncStatus === 'syncing') return;

    setSyncStatus('syncing');
    
    // Simulate API latency for data synchronization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const now = new Date().toISOString();
    setLastSynced(now);
    localStorage.setItem('lastSynced', now);
    setSyncStatus('synced');
  }, [isOnline, syncStatus]);

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

    const fine = totalLeave * LEAVE_FINE_RATE;
    const netSalary = (BASE_SALARY + (totalDel * DELIVERY_RATE) + bonus) - totalAdv - fine;

    return { totalDel, totalAdv, totalLeave, bonus, fine, netSalary };
  }, [filteredLogs]);

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
    const checkGoogleAuth = async () => {
      try {
        const res = await fetch('/api/auth/google/status');
        const data = await res.json();
        setIsGoogleAuthenticated(data.isAuthenticated);
      } catch (err) {
        console.error("Auth check error:", err);
      }
    };
    checkGoogleAuth();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGoogleAuthenticated(true);
        alert("গুগল ড্রাইভ সফলভাবে সংযুক্ত হয়েছে!");
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const connectGoogleDrive = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (err) {
      console.error("Connect error:", err);
    }
  };

  const backupToGoogleDrive = async () => {
    if (!isGoogleAuthenticated) {
      connectGoogleDrive();
      return;
    }

    setIsBackingUp(true);
    try {
      const res = await fetch('/api/backup/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { logs, settings },
          fileName: `cyber_rider_backup_${settings.userName}.json`
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert("ব্যাকআপ সফলভাবে গুগল ড্রাইভে সেভ হয়েছে!");
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error("Backup error:", err);
      alert("ব্যাকআপ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setIsBackingUp(false);
    }
  };
  const fetchDynamicInsight = useCallback(async () => {
    if (filteredLogs.length === 0 || isInsightLoading) return;
    
    setIsInsightLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
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
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      if (response.text) {
        setDynamicAiInsight(response.text.trim());
      }
    } catch (error) {
      console.error("Insight Error:", error);
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

  const playNotificationSound = useCallback(() => {
    if (!settings.notificationSound) return;
    const audio = new Audio(settings.notificationSound);
    audio.volume = settings.notificationVolume;
    audio.play().catch(err => console.error("Sound play error:", err));
  }, [settings.notificationSound, settings.notificationVolume]);

  const sendNotification = useCallback((title: string, body: string) => {
    playNotificationSound();
    if (notificationPermission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://picsum.photos/seed/rocket/128/128'
      });
    }
  }, [notificationPermission, playNotificationSound]);

  // --- Shift Reminder Logic ---
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      
      // Trigger if current time is >= shift time AND shift hasn't been marked as started
      if (currentTime >= settings.shiftTime && !isShiftActive && !aiOverlay.show) {
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
  const handleSaveEntry = () => {
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

    const newEntry: LogEntry = {
      id: editingId || crypto.randomUUID(),
      date: formData.date,
      count,
      advance,
      extraLeave
    };

    if (editingId) {
      setLogs(prev => prev.map(log => log.id === editingId ? newEntry : log));
      setEditingId(null);
    } else {
      setLogs(prev => [...prev, newEntry]);
    }

    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      count: '',
      advance: '',
      extraLeave: ''
    });
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
      onConfirm: () => {
        setLogs(prev => prev.filter(log => log.id !== id));
        setConfirmModal(prev => ({ ...prev, show: false }));
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
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="decorative-circle absolute w-[500px] h-[500px] -top-[100px] -left-[200px]" />
        <div className="hidden lg:block absolute right-20 top-[20%] w-72">
          <div className="bg-neon-purple text-white px-3 py-1 rounded-full text-[10px] font-bold inline-block mb-5 uppercase tracking-widest">
            COMMANDER v4.2
          </div>
          <h1 className="text-4xl font-display font-black text-white mb-2 leading-tight">
            Sci-Fi Tracker<br />
            <span className="text-neon-blue">Pro Edition</span>
          </h1>
          <p className="text-text-dim text-sm leading-relaxed">
            অত্যাধুনিক AI চালিত ডেলিভারি এবং স্যালারি ম্যানেজমেন্ট সিস্টেম। 
            আপনার দৈনন্দিন লক্ষ্য অর্জন করুন এবং রিয়েল-টাইম অ্যানালিটিক্স দেখুন।
          </p>
        </div>
      </div>

      {/* Mockup Container */}
      <div className="w-full max-w-[380px] h-[720px] bg-bg-dark border-[8px] border-[#1a1a1a] rounded-[40px] mockup-shadow relative flex flex-col overflow-hidden z-10">
        {/* Status Bar */}
        <div className="h-10 px-6 flex justify-between items-end text-[10px] text-text-dim font-mono pb-1">
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

        {/* Navbar */}
        <nav className="h-16 flex items-center justify-between px-6 shrink-0">
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
        <div className="flex-1 overflow-y-auto px-5 pb-24 scrollbar-hide">
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
                      <td className="py-3 px-2 text-center font-bold text-neon-blue">{log.count * DELIVERY_RATE}৳</td>
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
                      <td className="py-3 px-2 text-center font-bold text-neon-blue">{stats.totalDel * DELIVERY_RATE}৳</td>
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
                      <td className="py-3 px-2 text-center font-bold text-neon-red">{log.extraLeave * LEAVE_FINE_RATE}৳</td>
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

        {/* Bottom Nav */}
        <div className="h-[70px] bg-[#0e111f]/90 backdrop-blur-md border-t border-white/5 flex justify-around items-center shrink-0">
          <button className="w-6 h-6 border-2 border-neon-blue rounded-md shadow-[0_0_10px_var(--color-neon-blue)]" />
          <button 
            onClick={() => setShowAiChat(true)}
            className="w-10 h-10 bg-neon-purple rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(188,19,254,0.4)] hover:scale-110 active:scale-90 transition-all"
          >
            <Sparkles className="w-5 h-5 text-white" />
          </button>
          <button className="w-6 h-6 border-2 border-text-dim/50 rounded-md opacity-50" />
          <button className="w-6 h-6 border-2 border-text-dim/50 rounded-md opacity-50" />
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
              {/* Profile Section */}
              <div className="glass border-white/5 p-6 rounded-[2rem] mb-6">
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

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-text-dim mb-2 block">Monthly Target</label>
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
                    "w-full bg-white/5 border rounded-xl px-4 py-3 outline-none focus:ring-2 transition-all",
                    settingsError && settings.target <= 0 ? "border-neon-red/50 focus:ring-neon-red/20" : "border-neon-blue/30 focus:ring-neon-blue/20"
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-text-dim mb-2 block">Shift Start Time</label>
                <input 
                  type="time" 
                  value={settings.shiftTime}
                  onChange={(e) => setSettings(s => ({ ...s, shiftTime: e.target.value }))}
                  className="w-full bg-white/5 border border-neon-blue/30 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-neon-blue/20"
                />
              </div>

              <div className="pt-4 space-y-3">
                {settingsError && (
                  <p className="text-[10px] text-neon-red font-bold text-center mb-2">⚠️ {settingsError}</p>
                )}
                <div className="glass border-white/5 p-4 rounded-2xl mb-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase text-text-dim">Cloud Sync</span>
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
                        <option value="https://cdn.pixabay.com/audio/2022/03/15/audio_78390a3607.mp3">Futuristic Beep</option>
                        <option value="https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3">Cyber Alert</option>
                        <option value="https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73053.mp3">Digital Chime</option>
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
                      className="w-full py-2 bg-neon-blue/10 border border-neon-blue/30 rounded-xl text-[10px] font-bold uppercase text-neon-blue hover:bg-neon-blue/20 transition-all"
                    >
                      Test Sound
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
                confirmModal.type === 'delete' ? "bg-neon-red/10 border-neon-red/50 text-neon-red" : "bg-neon-blue/10 border-neon-blue/50 text-neon-blue"
              )}>
                {confirmModal.type === 'delete' ? <Trash2 className="w-8 h-8" /> : <Edit2 className="w-8 h-8" />}
              </div>
              
              <h2 className={cn(
                "text-2xl font-display font-black uppercase mb-4 tracking-tight",
                confirmModal.type === 'delete' ? "text-neon-red" : "text-neon-blue"
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
                    confirmModal.type === 'delete' ? "bg-neon-red" : "bg-neon-blue"
                  )}
                >
                  নিশ্চিত করুন
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
                    const fineEntry: LogEntry = {
                      id: crypto.randomUUID(),
                      date: today,
                      count: 0,
                      advance: 0,
                      extraLeave: 1
                    };
                    setLogs(prev => [...prev, fineEntry]);
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
    </div>
  );
}
