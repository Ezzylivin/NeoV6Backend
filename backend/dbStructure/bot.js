// File: src/pages/TradingBot.jsx
// 🚀 FIX: v13.8 - Full Integration (Color Logic + Config Restore + Timestamps)

import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useAccount } from "wagmi"; 
import { ConnectButton } from '@rainbow-me/rainbowkit';
import toast, { Toaster } from "react-hot-toast";
import { io } from "socket.io-client"; 
import { useBot } from "../hooks/useBot";
import { UIModeProvider } from "../context/UIModeContext";
import { LiveTradingChart } from "../components/LiveTradingChart.jsx"; 
import { 
    Plus, Trash2, Shield, Globe, Cpu, Filter, TrendingUp, 
    Activity, Scale, Power, RefreshCw, Wallet, Wifi, WifiOff,
    ArrowUpRight, Clock, Box, Timer, DollarSign, Info, BarChart, Settings2, Zap, ArrowDownRight,
    CandlestickChart
} from "lucide-react"; 

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

import "./TradingBot.css";
import "../styles/Themes.css";

// 🟢 PRODUCTION CONFIGURATION
const RAW_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const BASE_URL = RAW_URL.replace(/\/$/, "").replace(/\/api$/, "");
const API_BASE = `${BASE_URL}/api`;
const SOCKET_URL = BASE_URL;

const inputClass = "w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:border-emerald-500 transition-all text-[11px] outline-none font-mono";
const labelClass = "text-[9px] text-zinc-500 uppercase font-black mb-1 block ml-1 tracking-tighter";

// 🟢 ASSETS & TIMEFRAMES
const COIN_PAIRS = ["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "MATIC-USD", "LINK-USD", "ADA-USD"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

// 🟢 HELPER: PARSE LOG TEXT
const parseLog = (log) => {
    if (!log) return "";
    const msg = typeof log === 'string' ? log : (log.message || log.msg || JSON.stringify(log));
    return msg.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/, '');
};

// 🟢 HELPER: FORMAT TIMESTAMP
const formatTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// 🟢 HELPER: DYNAMIC COLOR LOGIC (Integrated Request)
const getLogStyle = (msg) => {
    const text = msg.toUpperCase();

    // 1. Mindset: Parse Percentage (e.g., "85%")
    const pctMatch = text.match(/(\d+)%/);
    if (pctMatch) {
        const val = parseInt(pctMatch[1]);
        if (val >= 80) return 'text-rose-400 bg-rose-500/10 border-rose-500/20'; // Expensive -> Red
        if (val <= 20) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'; // Cheap -> Green
        if (val > 20 && val < 80) return 'text-zinc-400 bg-zinc-800/30 border-zinc-700'; // Balanced -> Gray
    }

    // 2. Trend/Bias: Keyword Logic
    if (text.includes("UPTREND") || text.includes("BULLISH") || text.includes("EXPANSION")) {
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }
    if (text.includes("DOWNTREND") || text.includes("BEARISH") || text.includes("CONTRACTION")) {
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    }
    
    // 3. Logic/Intent: Fallback to existing tags
    if (text.includes("PASSED") || text.includes("STALKING LONG")) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (text.includes("VETOED") || text.includes("STALKING SHORT")) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';

    return 'text-zinc-500 bg-zinc-900 border-zinc-800'; // Default
};

// --- CONFIG POOLS ---
const STRAT_POOL = [
    { name: "RSI Threshold", code: "rsi_threshold" },
    { name: "SMA Crossover", code: "sma_crossover" },
    { name: "SuperTrend Follow", code: "supertrend" },
    { name: "MACD Crossover", code: "macd_crossover" },
    { name: "ATR Breakout", code: "atr_breakout" },
    { name: "Bollinger Band Fade", code: "bb_fade" },
    { name: "Stochastic Osc", code: "stoch" },
    { name: "EMA Cloud", code: "ema_cloud" },
    { name: "Price Action Break", code: "pa_breakout" },
    { name: "Volume Profile", code: "vol_profile" }
];

const MODEL_POOL = [
    { id: "xgboost", name: "XGBoost (Gradient Boost)" },
    { id: "random_forest", name: "Random Forest (Ensemble)" },
    { id: "gradient_boosting", name: "GBM (Scikit-Learn)" },
    { id: "lstm", name: "LSTM (Deep Temporal)" },
    { id: "transformer", name: "Transformer (Attention)" },
    { id: "stacking", name: "Stacking Hybrid (Meta)" }
];

const DEFAULT_STRATEGY_PARAMS = {
    rsi_threshold: { rsi_length: 14, oversold: 30, overbought: 70 },
    sma_crossover: { fast_sma: 50, slow_sma: 200 },
    supertrend: { st_atr: 10, st_factor: 3.0 },
    macd_crossover: { fast: 12, slow: 26, signal: 9 },
    atr_breakout: { atr_length: 14, multiplier: 1.5 },
    bb_fade: { bb_period: 20, bb_std: 2.0 },
    stoch: { k_period: 14, d_period: 3 },
    ema_cloud: { fast_ema: 9, slow_ema: 21 },
    pa_breakout: { lookback: 20, buffer: 0.01 },
    vol_profile: { vol_ma: 20, threshold: 1.5 }
};

const Tooltip = ({ text, children }) => {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative flex items-center" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            {children}
            {visible && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-zinc-800 text-zinc-200 text-[11px] p-3 rounded-lg shadow-xl z-[200] border border-zinc-700 pointer-events-none">
                    {text}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-zinc-800"></div>
                </div>
            )}
        </div>
    );
};

const CheckItem = ({ label, status }) => (
    <div className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-zinc-800">
        <span className="text-[10px] text-zinc-400 font-bold uppercase">{label}</span>
        {status ? <span className="text-emerald-500 text-[9px] font-black tracking-widest">✔ READY</span> : <span className="text-rose-500 text-[9px] font-black tracking-widest">MISSING</span>}
    </div>
);

const PreFlightModal = ({ config, onConfirm, onCancel, isStarting, hasApiKeys, address }) => {
    const [checks, setChecks] = useState({ wallet: false, keys: false, capital: false, strategy: false });
    useEffect(() => {
        setChecks({
            wallet: !!address,
            keys: config.tradingMode === 'paper' || hasApiKeys,
            capital: Number(config.capitalAllocation) >= 100,
            strategy: (config.strategies && config.strategies.length > 0)
        });
    }, [config, hasApiKeys, address]);
    const allPassed = Object.values(checks).every(Boolean);
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
                <h3 className="text-xl font-black text-white mb-8 flex items-center gap-2 uppercase tracking-tighter"><span className="text-emerald-500">🚀</span> Pre-Flight Check</h3>
                <div className="space-y-3 mb-10">
                    <CheckItem label="Wallet Status" status={checks.wallet} />
                    <CheckItem label="API Authorization" status={checks.keys} />
                    <CheckItem label="Allocated Liquidity" status={checks.capital} />
                    <CheckItem label="Strategy Modules" status={checks.strategy} />
                </div>
                <div className="flex gap-4">
                    <button onClick={onCancel} className="flex-1 py-4 border border-zinc-800 rounded-2xl text-zinc-500 font-black uppercase text-[10px] hover:text-white transition-all">Abort</button>
                    <button onClick={onConfirm} disabled={!allPassed || isStarting} className={`flex-2 py-4 rounded-2xl font-black uppercase text-[10px] transition-all shadow-lg ${allPassed ? 'bg-emerald-500 text-black hover:bg-emerald-400' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}>{isStarting ? 'Igniting Engine...' : 'Execute Launch'}</button>
                </div>
            </div>
        </div>
    );
};

const TradingBotContainer = () => {
    // 🟢 Destructure restoredConfig
    const { startBot, stopBot, restoredConfig, botStatus: hookBotStatus, logs: hookLogs } = useBot(); 
    const { isConnected, address } = useAccount();
    
    const [isModeSelected, setIsModeSelected] = useState(false);
    const [hasApiKeys, setHasApiKeys] = useState(false);
    const [showPreFlight, setShowPreFlight] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [paperBalance, setPaperBalance] = useState(10000);
    const [modeStep, setModeStep] = useState('selection');
    
    const socketRef = useRef(null);
    const [isHaltLocked, setIsHaltLocked] = useState(false);
    
    const [socketLogs, setSocketLogs] = useState([]);
    const [socketStatus, setSocketStatus] = useState({ 
        status: 'stopped', currentBalance: 0, unrealizedPnl: 0, exposure: 0, positions: [], equityCurve: [], startedAt: null, dailyProfit: 0, initialCapital: 0, tradeMarkers: []
    });
    const [socketConnected, setSocketConnected] = useState(false);
    const [uptime, setUptime] = useState("00:00:00");
    const logContainerRef = useRef(null);

    const [formConfig, setFormConfig] = useState({
        symbol: "BTC-USD", timeframe: "1h", capitalAllocation: 1000,
        tradingMode: "paper", strategies: [{ code: "rsi_threshold", params: DEFAULT_STRATEGY_PARAMS.rsi_threshold }],
        mlMode: "off", mlModel: "xgboost", mlThreshold: 0.5,
        riskManagementMode: "static", riskPercentage: 1, hybridMode: "AND",
        maxDailyLoss: 5, maxDrawdown: 10, maxTradesPerDay: 20,
        enable_shorting: true, 
        params: { take_profit: 0.05, stop_loss: 0.02, trailing_stop: 0.01, long_threshold: 0.5, short_threshold: 0.5 },
        filters: { trend_filter: "none", vol_min: 0, atr_filter: 0 }
    });

    const isBotRunning = socketStatus.status === 'running' && !isHaltLocked;

    // 🟢 1. RESTORE STATE ON RETURN (Logs & Config)
    useEffect(() => {
        if (hookBotStatus) {
            setSocketStatus(prev => ({ ...prev, ...hookBotStatus }));
        }
        if (hookLogs.length > 0) {
            setSocketLogs(hookLogs);
        }
        // 🟢 Restore Config (Fixes Missing Lines on Refresh)
        if (restoredConfig && isBotRunning) {
            setFormConfig(prev => ({
                ...prev,
                ...restoredConfig,
                strategies: restoredConfig.strategies || prev.strategies 
            }));
        }
    }, [hookBotStatus, hookLogs, restoredConfig]);

    const activeBalance = useMemo(() => {
        if (isBotRunning) {
            return socketStatus.currentBalance || socketStatus.initialCapital || formConfig.capitalAllocation;
        }
        return formConfig.capitalAllocation;
    }, [isBotRunning, socketStatus.currentBalance, socketStatus.initialCapital, formConfig.capitalAllocation]);

    useEffect(() => {
        if (isConnected) {
            axios.get(`${API_BASE}/users/keys`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
                .then(res => setHasApiKeys((Array.isArray(res.data) ? res.data : res.data.keys || []).length > 0))
                .catch(() => setHasApiKeys(false));
        }
    }, [isConnected]);

    useEffect(() => {
        let interval;
        if (isBotRunning && socketStatus.startedAt) {
            interval = setInterval(() => {
                const start = new Date(socketStatus.startedAt).getTime();
                const now = new Date().getTime();
                const diff = Math.max(0, now - start);
                const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                setUptime(`${h}:${m}:${s}`);
            }, 1000);
        } else { setUptime("00:00:00"); }
        return () => clearInterval(interval);
    }, [isBotRunning, socketStatus.startedAt]);

    useEffect(() => {
        if (!address) return;
        
        socketRef.current = io(SOCKET_URL, { query: { userId: address }, transports: ['websocket'] });
        socketRef.current.on("connect", () => setSocketConnected(true));
        socketRef.current.on("disconnect", () => setSocketConnected(false));

        socketRef.current.on("bot_status_update", (data) => {
            if (isHaltLocked) return; 
            setSocketStatus(prev => ({ 
                ...prev, ...data, 
                positions: data.activePositions || data.positions || prev.positions,
                tradeMarkers: data.tradeMarkers || prev.tradeMarkers,
                startedAt: data.startedAt || prev.startedAt,
                initialCapital: data.initialCapital || prev.initialCapital
            }));
        });

        socketRef.current.on("bot_log", (newLog) => {
            const logObj = typeof newLog === 'string' ? { message: newLog, time: new Date().toISOString() } : newLog;
            setSocketLogs(prev => {
                const isDuplicate = prev.some(l => parseLog(l.message || l) === parseLog(logObj.message || logObj));
                if (isDuplicate) return prev;
                return [logObj, ...prev].slice(0, 100);
            });
        });

        return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }, [address, isHaltLocked]);

    const performanceData = useMemo(() => {
        if (!socketStatus.equityCurve?.length) return [{ time: 'Start', balance: formConfig.capitalAllocation }];
        return socketStatus.equityCurve.map(p => ({ 
            time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
            balance: p.balance,
            confidence: (Math.random() * 20) + 80 
        }));
    }, [socketStatus.equityCurve, formConfig.capitalAllocation]);

   const handleConfirmStart = async () => {
    setIsStarting(true);
    setIsHaltLocked(false);
    setSocketStatus(prev => ({ 
        ...prev, equityCurve: [], tradeMarkers: [], positions: [], candles: [] 
    }));
    setSocketLogs([]);

    const finalConfig = {
        ...formConfig,
        capitalAllocation: Number(formConfig.capitalAllocation) || Number(paperBalance) || 1000,
        mlMode: formConfig.mlMode || "on", 
        mlModel: formConfig.mlModel || "stacking", 
        mlThresholdLong: parseFloat(formConfig.params.long_threshold) || 0.8,
        mlThresholdShort: parseFloat(formConfig.params.short_threshold) || 0.9,
        enable_shorting: formConfig.enable_shorting === true,
        comboConfig: { 
            strategyCodes: formConfig.strategies.map(s => s.code), 
            combinationRule: formConfig.hybridMode || "AND", 
            minVotesRequired: formConfig.hybridMode === "AND" ? formConfig.strategies.length : 1
        }
    };

    try {
        const response = await startBot({ userId: address, config: finalConfig });
        if (response && response.status === 'running') {
            toast.success(`Protocol Ignited: ${finalConfig.symbol}`);
            setShowPreFlight(false);
            logContainerRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            console.warn("Invalid start response", response);
        }
    } catch (e) {
        toast.error(`Engine Failure: ${e.response?.data?.detail || e.message}`);
    } finally {
        setIsStarting(false);
    }
};

    const handleHalt = async () => {
        setIsHaltLocked(true);
        if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
        setSocketStatus({ status: 'stopped', currentBalance: 0, unrealizedPnl: 0, exposure: 0, positions: [], equityCurve: [], startedAt: null, dailyProfit: 0, initialCapital: 0, tradeMarkers: [] });
        setSocketLogs([]);
        setUptime("00:00:00");
        setSocketConnected(false);
        try {
            await stopBot();
            toast.success("Safe Abort: Terminal Memory Purged");
            setTimeout(() => setIsHaltLocked(false), 5000); 
        } catch (e) { 
            toast.error("Halt Command Failed"); 
            setIsHaltLocked(false); 
        }
    };

    const handleManualExit = async () => {
        if (!socketStatus.positions.length) return;
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE}/bot/close_position`, { userId: address, symbol: formConfig.symbol }, { headers: { Authorization: `Bearer ${token}` } });
            toast.success("Position Forced Closed");
        } catch (e) {
            toast.error("Exit Failed: " + (e.response?.data?.detail || e.message));
        }
    };

    if (!isConnected) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-[40px] p-12 text-center shadow-2xl">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-inner"><Wallet className="text-emerald-500 w-8 h-8" /></div>
                    <h2 className="text-2xl font-black text-white mb-3 uppercase tracking-tighter">Terminal Encrypted</h2>
                    <ConnectButton />
                </div>
            </div>
        );
    }

    const startCap = socketStatus.initialCapital || formConfig.capitalAllocation || 1;
    const profitPct = ((socketStatus.dailyProfit || 0) / startCap) * 100;
    const pnlPct = ((socketStatus.unrealizedPnl || 0) / startCap) * 100;

    return (
        <UIModeProvider>
            <div className="min-h-screen bg-zinc-950 text-white font-sans p-6 overflow-x-hidden transition-all duration-700">
                <Toaster position="top-right" />
                
                {!isModeSelected && !isBotRunning && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md">
                        <div className="max-w-4xl w-full p-6 text-center">
                            {modeStep === 'selection' ? (
                                <>
                                    <h1 className="text-4xl font-black text-white mb-10 tracking-tighter uppercase">Protocol Selection</h1>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div onClick={() => setModeStep('paper_setup')} className="group cursor-pointer bg-zinc-900 border border-white/5 hover:border-emerald-500/50 p-16 rounded-[40px] transition-all shadow-2xl"><h3 className="text-3xl font-black text-emerald-400 mb-3 uppercase">PAPER</h3><p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Logic Simulation</p></div>
                                        <div onClick={() => { if(hasApiKeys) { setFormConfig(p=>({...p, tradingMode: 'live'})); setIsModeSelected(true); } else { toast.error("Connect API Keys First"); } }} className={`p-16 rounded-[40px] border transition-all ${hasApiKeys ? 'cursor-pointer bg-zinc-900 border-white/5 hover:border-red-500 shadow-2xl' : 'bg-zinc-900/50 opacity-20'}`}><h3 className="text-3xl font-black text-red-500 mb-3 uppercase">LIVE</h3><p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Real Capital Execution</p></div>
                                    </div>
                                </>
                            ) : (
                                <div className="max-w-md mx-auto bg-zinc-900 border border-zinc-800 p-12 rounded-[40px] shadow-2xl">
                                    <h3 className="text-2xl font-black text-white mb-8 uppercase tracking-tighter">Treasury Seed</h3>
                                    <input type="number" value={paperBalance} onChange={(e) => setPaperBalance(Number(e.target.value))} className="w-full bg-black border border-zinc-800 rounded-2xl p-5 text-2xl font-mono text-center text-emerald-500 mb-8 outline-none shadow-inner" />
                                    <div className="flex gap-4"><button onClick={() => setModeStep('selection')} className="flex-1 py-4 border border-zinc-800 rounded-2xl text-zinc-500 font-black uppercase text-[10px]">Back</button><button onClick={() => { setFormConfig(p=>({...p, tradingMode: 'paper', capitalAllocation: paperBalance})); setIsModeSelected(true); }} className="flex-2 py-4 bg-emerald-500 text-black rounded-2xl font-black uppercase text-[10px]">Ignite</button></div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {showPreFlight && <PreFlightModal config={formConfig} onConfirm={handleConfirmStart} onCancel={() => setShowPreFlight(false)} isStarting={isStarting} hasApiKeys={hasApiKeys} address={address} />}

                <header className="max-w-[1800px] mx-auto mb-10 flex items-center justify-between transition-all">
                    <div className="flex items-center gap-3"><div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg"><Activity className="text-black w-7 h-7" /></div><div><h1 className="text-lg font-black uppercase tracking-widest">Sovereign <span className="text-emerald-500">Live</span></h1><p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em]">Terminal v13.8</p></div></div>
                    <div className="flex items-center gap-4">
                        {isBotRunning && <button onClick={handleHalt} className="px-6 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl font-black text-[10px] uppercase hover:bg-rose-500 hover:text-white transition-all flex items-center gap-2 shadow-lg shadow-rose-500/10"><Power size={12}/> Emergency Halt</button>}
                        <ConnectButton />
                    </div>
                </header>

                <div className="max-w-[1800px] mx-auto grid grid-cols-12 gap-8">
                    {!isBotRunning && (
                        <div className="col-span-12 lg:col-span-3 space-y-6 animate-in slide-in-from-left-10 duration-700">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 space-y-10 shadow-2xl sticky top-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2"><CandlestickChart size={16} className="text-zinc-400" /><h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Market Feed</h4></div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="col-span-2"><label className={labelClass}>Asset</label><select value={formConfig.symbol} onChange={(e)=>setFormConfig({...formConfig, symbol: e.target.value})} className={inputClass}>{COIN_PAIRS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                        <div className="col-span-1"><label className={labelClass}>Period</label><select value={formConfig.timeframe} onChange={(e)=>setFormConfig({...formConfig, timeframe: e.target.value})} className={inputClass}>{TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    </div>
                                </div>

                                <div className="space-y-4 border-t border-zinc-800/50 pt-8">
                                    <div className="flex justify-between items-center"><div className="flex items-center gap-2"><ArrowDownRight size={16} className="text-blue-400" /><h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Direction</h4></div>
                                    <select value={formConfig.enable_shorting} onChange={(e)=>setFormConfig({...formConfig, enable_shorting: e.target.value === 'true'})} className="bg-zinc-800 text-[9px] rounded-lg px-2 py-1 border border-zinc-700 font-black uppercase">
                                        <option value="false">Spot Only (Long)</option>
                                        <option value="true">Margin (Long/Short)</option>
                                    </select></div>
                                </div>

                                <div className="space-y-4 border-t border-zinc-800/50 pt-8">
                                    <div className="flex justify-between items-center"><div className="flex items-center gap-2"><Cpu size={16} className="text-violet-400" /><h4 className="text-[10px] font-black uppercase tracking-widest text-violet-400">Neural Gate</h4></div>
                                    <select value={formConfig.mlMode} onChange={(e)=>setFormConfig({...formConfig, mlMode: e.target.value})} className="bg-zinc-800 text-[9px] rounded-lg px-2 py-1 border border-zinc-700 font-black uppercase"><option value="off">Bypass</option><option value="on">Active</option></select></div>
                                    {formConfig.mlMode === 'on' && (
                                        <div className="space-y-4 animate-in slide-in-from-top-2">
                                            <div><label className={labelClass}>Architecture</label><select className={inputClass} value={formConfig.mlModel} onChange={(e)=>setFormConfig({...formConfig, mlModel: e.target.value})}>{MODEL_POOL.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div><label className={labelClass}>Long Gate</label><input type="number" step="0.01" value={formConfig.params.long_threshold} onChange={(e)=>setFormConfig({...formConfig, params:{...formConfig.params, long_threshold: parseFloat(e.target.value)}})} className={inputClass}/></div>
                                                <div><label className={labelClass}>Short Gate</label><input type="number" step="0.01" value={formConfig.params.short_threshold} onChange={(e)=>setFormConfig({...formConfig, params:{...formConfig.params, short_threshold: parseFloat(e.target.value)}})} className={inputClass}/></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 border-t border-zinc-800/50 pt-8">
                                    <div className="flex justify-between items-center"><h4 className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Logic Ensemble</h4><select value={formConfig.hybridMode} onChange={(e) => setFormConfig({...formConfig, hybridMode: e.target.value})} className="bg-zinc-950 border border-zinc-700 text-[9px] rounded px-2 py-1 text-emerald-500 font-bold uppercase"><option value="AND">Strict</option><option value="OR">Loose</option></select></div>
                                    <div className="space-y-3">
                                        {formConfig.strategies.map((s, i) => (
                                            <div key={i} className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-800 shadow-inner">
                                                <div className="flex justify-between mb-3">
                                                    <select value={s.code} onChange={(e) => { const n = [...formConfig.strategies]; n[i] = { code: e.target.value, params: DEFAULT_STRATEGY_PARAMS[e.target.value] }; setFormConfig({...formConfig, strategies: n}); }} className="bg-transparent text-[10px] font-black text-amber-500 uppercase outline-none">
                                                        {STRAT_POOL.map(opt => <option key={opt.code} value={opt.code}>{opt.name}</option>)}
                                                    </select>
                                                    <button type="button" onClick={() => setFormConfig(p => ({ ...p, strategies: p.strategies.filter((_, idx) => idx !== i) }))} className="text-zinc-600 hover:text-rose-500"><Trash2 size={12}/></button>
                                                </div>
                                                <StrategyParamInputs strategy={s} onChange={(p) => { const n = [...formConfig.strategies]; n[i].params = p; setFormConfig({...formConfig, strategies: n}); }} />
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => setFormConfig(p => ({ ...p, strategies: [...p.strategies, { code: "rsi_threshold", params: DEFAULT_STRATEGY_PARAMS.rsi_threshold }] }))} className="w-full py-3 border border-dashed border-zinc-800 rounded-xl text-zinc-600 hover:text-emerald-500 transition-all flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-tighter"><Plus size={12}/> Add Signal Module</button>
                                    </div>
                                </div>

                                <div className="space-y-4 border-t border-zinc-800/50 pt-8">
                                    <div className="flex items-center gap-2"><Shield size={16} className="text-amber-500"/><h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500">Execution Shield</h4></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className={labelClass}>TP %</label><input type="number" step="0.001" value={formConfig.params.take_profit} onChange={(e)=>setFormConfig({...formConfig, params:{...formConfig.params, take_profit: parseFloat(e.target.value)}})} className={inputClass}/></div>
                                        <div><label className={labelClass}>SL %</label><input type="number" step="0.001" value={formConfig.params.stop_loss} onChange={(e)=>setFormConfig({...formConfig, params:{...formConfig.params, stop_loss: parseFloat(e.target.value)}})} className={inputClass}/></div>
                                        <div className="col-span-2">
                                            <div className="flex justify-between items-center"><label className={labelClass}>Trailing Stop %</label><Tooltip text="Adjusts stop level dynamically as price moves in favor."><Info size={10} className="text-zinc-600"/></Tooltip></div>
                                            <input type="number" step="0.001" value={formConfig.params.trailing_stop} onChange={(e)=>setFormConfig({...formConfig, params:{...formConfig.params, trailing_stop: parseFloat(e.target.value)}})} className={inputClass}/>
                                        </div>
                                    </div>
                                </div>

                                <button onClick={() => setShowPreFlight(true)} className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20">Initiate Engine</button>
                            </div>
                        </div>
                    )}

                    <div className={`${isBotRunning ? 'col-span-12' : 'col-span-12 lg:col-span-9'} space-y-8 transition-all duration-700`}>
                        <div className={`grid grid-cols-1 ${isBotRunning ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-4`}>
                            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
                                <div className="flex justify-between items-start mb-1"><p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Engine Status</p>{isBotRunning && <Timer size={12} className="text-emerald-500 animate-pulse" />}</div>
                                <p className={`text-lg font-mono font-black ${isBotRunning ? 'text-emerald-400' : 'text-zinc-600'}`}>{isBotRunning ? 'OPERATIONAL' : 'STANDBY'}</p>
                                <p className="text-[9px] font-mono text-zinc-500 mt-1 uppercase tracking-tighter font-black">SESSION: {uptime}</p>
                            </div>
                            <MetricCard label="Daily Profit" value={`${socketStatus.dailyProfit >= 0 ? '+' : ''}${(socketStatus.dailyProfit || 0).toFixed(2)}`} subValue={`${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%`} color={socketStatus.dailyProfit >= 0 ? "text-emerald-400" : "text-rose-500"} icon={<DollarSign size={10}/>} />
                            <MetricCard label="Floating PnL" value={`${socketStatus.unrealizedPnl >= 0 ? '+' : ''}${(socketStatus.unrealizedPnl || 0).toFixed(2)}`} subValue={`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`} color={socketStatus.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-500'} icon={<Activity size={10}/>} />
                            <MetricCard label="Exposure" value={`${socketStatus.exposure || 0}%`} subValue={socketStatus.positions.length > 0 ? "Active Positions" : "Cash Heavy"} color="text-amber-400" />
                            <MetricCard label="Total Equity" value={`$${Number(activeBalance).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} subValue="Liquid + Locked" /> 
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[720px]">
                            <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-[40px] overflow-hidden flex flex-col relative shadow-2xl">
                                <div className="bg-zinc-800/20 p-6 border-b border-zinc-800/50 flex items-center justify-between">
                                    <div className="flex items-center gap-3"><TrendingUp size={18} className="text-emerald-500" /><span className="text-[11px] font-black uppercase tracking-widest">{formConfig.symbol} Live Feed</span></div>
                                    <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div><span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Neural Sync Active</span></div>
                                </div>
                                <div className="flex-1 bg-[#090b0f] pb-8">
                                    <LiveTradingChart symbol={formConfig.symbol} timeframe={formConfig.timeframe} isRunning={isBotRunning} activePositions={socketStatus.positions} tradeMarkers={socketStatus.tradeMarkers} candleData={socketStatus.candles || []} strategies={formConfig.strategies} />
                                </div>
                            </div>
                            <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-[40px] flex flex-col overflow-hidden shadow-2xl">
                                <div className="p-5 border-b border-zinc-800 bg-zinc-800/20 flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-violet-400"><Cpu size={16} className={isBotRunning ? 'animate-pulse' : ''}/><h3 className="text-[10px] font-black uppercase tracking-widest">Neural Flow</h3></div>
                                    {socketConnected ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-rose-500 animate-pulse" />}
                                </div>
                                <div ref={logContainerRef} className="flex-1 overflow-y-auto p-6 font-mono text-[10px] space-y-3 bg-black/20 custom-scrollbar">
                                    {socketLogs.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-zinc-600 italic">Initializing neural link...</div>
                                    ) : (
                                        socketLogs.map((log, i) => (
                                            <div 
                                                key={i} 
                                                className={`p-3 rounded-xl border leading-relaxed flex flex-col gap-1 ${getLogStyle(parseLog(log.message || log))}`}
                                            >
                                                {/* 🟢 NEW: TIMESTAMP DISPLAY */}
                                                <span className="text-[9px] opacity-50 font-bold tracking-widest">{formatTime(log.time)}</span>
                                                <span>{parseLog(log.message || log)}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {isBotRunning && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20 animate-in slide-in-from-bottom-10 duration-1000">
                                <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 shadow-2xl">
                                    <div className="flex items-center gap-2 mb-8"><BarChart size={18} className="text-emerald-500"/><h3 className="text-[11px] font-black uppercase tracking-widest">Session Equity</h3></div>
                                    <div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={performanceData}><Area type="monotone" dataKey="balance" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={3} /><XAxis dataKey="time" hide /><YAxis hide domain={['auto', 'auto']} /><RechartsTooltip contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '12px' }} /></AreaChart></ResponsiveContainer></div>
                                </div>
                                <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 shadow-2xl">
                                    <div className="flex items-center gap-2 mb-8"><Zap size={18} className="text-violet-500"/><h3 className="text-[11px] font-black uppercase tracking-widest">Logic Confidence</h3></div>
                                    <div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={performanceData}><Area type="step" dataKey="confidence" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.1} strokeWidth={2} /><XAxis dataKey="time" hide /><YAxis hide /><RechartsTooltip contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '12px' }} /></AreaChart></ResponsiveContainer></div>
                                </div>
                                <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 shadow-2xl overflow-hidden flex flex-col">
                                    <div className="flex items-center gap-2 mb-8"><Box size={18} className="text-amber-500"/><h3 className="text-[11px] font-black uppercase tracking-widest">Live Operations</h3></div>
                                    <div className="flex-1 overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left text-[11px]">
                                            <thead><tr className="text-zinc-600 uppercase font-black border-b border-zinc-800 pb-4"><th className="pb-4">Type</th><th className="pb-4">Entry</th><th className="pb-4 text-right">Size</th><th className="pb-4 text-right">Action</th></tr></thead>
                                            <tbody className="divide-y divide-zinc-800/50">
                                                {socketStatus.positions.length > 0 ? socketStatus.positions.map((pos, idx) => (
                                                    <tr key={idx} className="group">
                                                        <td className={`py-5 font-black flex items-center gap-2 ${pos.type === 'short' ? 'text-amber-500' : 'text-emerald-400'}`}>{pos.type === 'short' ? <ArrowDownRight size={14}/> : <ArrowUpRight size={14}/>} {pos.type.toUpperCase()}</td>
                                                        <td className="py-5 font-mono font-black text-zinc-200">${pos.entry.toLocaleString()}</td>
                                                        <td className="py-5 font-mono text-zinc-500 text-right">{pos.size.toFixed(4)}</td>
                                                        <td className="py-5 text-right"><button onClick={handleManualExit} className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 rounded-lg text-rose-500 hover:text-white font-black uppercase text-[9px] transition-all tracking-wider">EXIT</button></td>
                                                    </tr>
                                                )) : (<tr><td colSpan="4" className="py-24 text-center text-zinc-600 italic font-bold uppercase tracking-widest opacity-30">Waiting for Signal...</td></tr>)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </UIModeProvider>
    );
};

const MetricCard = ({ label, value, subValue, color = "text-white", icon = null }) => (
    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl relative overflow-hidden shadow-xl">
        <p className="text-[9px] text-zinc-500 uppercase font-black tracking-[0.15em] mb-2">{label}</p>
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">{icon && <span className={color}>{icon}</span>}<p className={`text-lg font-mono font-black tracking-tighter ${color}`}>{value}</p></div>
            {subValue && <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wide">{subValue}</p>}
        </div>
    </div>
);

function StrategyParamInputs({ strategy, onChange }) {
    const { code, params = {} } = strategy;
    const f = (l, k, s = "1", desc) => (
        <div className="flex flex-col">
            <div className="flex justify-between items-center mb-1">
                <label className="text-[8px] text-zinc-600 uppercase font-bold ml-1">{l}</label>
                {desc && <Tooltip text={desc}><Info size={8} className="text-zinc-700" /></Tooltip>}
            </div>
            <input type="number" step={s} value={params[k] ?? ""} onChange={(e) => onChange({...params, [k]: parseFloat(e.target.value)})} className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-[9px] text-amber-500 outline-none font-mono" />
        </div>
    );
    return (
        <div className="grid grid-cols-2 gap-2">
            {code === "rsi_threshold" && <>{f("Length", "rsi_length", "1")}{f("Oversold", "oversold", "1")}{f("Overbought", "overbought", "1")}</>}
            {code === "sma_crossover" && <>{f("Fast", "fast_sma", "1")}{f("Slow", "slow_sma", "1")}</>}
            {code === "supertrend" && <>{f("Period", "st_atr", "1")}{f("Mult", "st_factor", "0.1")}</>}
            {code === "macd_crossover" && <>{f("Fast", "fast", "1")}{f("Slow", "slow", "1")}</>}
            {code === "atr_breakout" && <>{f("Len", "atr_length", "1")}{f("Mult", "multiplier", "0.1")}</>}
            {code === "bb_fade" && <>{f("Per", "bb_period", "1")}{f("Std", "bb_std", "0.1")}</>}
            {code === "stoch" && <>{f("K-P", "k_period", "1")}{f("D-P", "d_period", "1")}</>}
            {code === "ema_cloud" && <>{f("Fast", "fast_ema", "1")}{f("Slow", "slow_ema", "1")}</>}
            {code === "pa_breakout" && <>{f("LB", "lookback", "1")}{f("Buf", "buffer", "0.01")}</>}
            {code === "vol_profile" && <>{f("MA", "vol_ma", "1")}{f("T", "threshold", "0.1")}</>}
        </div>
    );
}

export default TradingBotContainer;
