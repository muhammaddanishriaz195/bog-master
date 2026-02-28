import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PenTool, 
  Search, 
  Image as ImageIcon, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  Settings,
  LayoutDashboard,
  History,
  Share2,
  Globe,
  ArrowRight,
  Languages,
  Sparkles,
  Eye,
  FileText,
  HelpCircle,
  X,
  LogOut
} from 'lucide-react';
import { getAI, SYSTEM_INSTRUCTIONS, TOOLS, generateImage, searchTrends } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LogEntry {
  id: string;
  step: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  message: string;
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

const TONES = [
  { id: 'professional', label: 'Professional', icon: '👔' },
  { id: 'humorous', label: 'Humorous', icon: '😂' },
  { id: 'technical', label: 'Technical', icon: '💻' },
  { id: 'inspirational', label: 'Inspirational', icon: '✨' },
  { id: 'casual', label: 'Casual', icon: '☕' }
];

const LANGUAGES = [
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'es', label: 'Spanish', flag: '🇪🇸' },
  { id: 'fr', label: 'French', flag: '🇫🇷' },
  { id: 'de', label: 'German', flag: '🇩🇪' },
  { id: 'ur', label: 'Urdu', flag: '🇵🇰' },
  { id: 'hi', label: 'Hindi', flag: '🇮🇳' }
];

export default function App() {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');
  const [language, setLanguage] = useState('en');
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [abResults, setAbResults] = useState<any[]>([]);

  useEffect(() => {
    const savedTokens = localStorage.getItem('blogger_tokens');
    if (savedTokens) {
      setTokens(JSON.parse(savedTokens));
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const newTokens = event.data.tokens;
        setTokens(newTokens);
        localStorage.setItem('blogger_tokens', JSON.stringify(newTokens));
      }
    };
    window.addEventListener('message', handleMessage);
    
    // Fetch initial A/B results
    fetchAbResults();

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchAbResults = async () => {
    try {
      const res = await fetch('/api/ab-test/results');
      const data = await res.json();
      setAbResults(data);
    } catch (err) {
      console.error('Failed to fetch A/B results', err);
    }
  };

  const connectBlogger = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      console.error('Failed to get auth URL', err);
      setShowSetupGuide(true);
    }
  };

  const logout = () => {
    setTokens(null);
    localStorage.removeItem('blogger_tokens');
  };

  const addLog = (step: string, message: string, status: LogEntry['status'] = 'loading') => {
    const id = Math.random().toString(36).substr(2, 9);
    setLogs(prev => [...prev, { id, step, message, status }]);
    return id;
  };

  const updateLog = (id: string, status: LogEntry['status'], message?: string) => {
    setLogs(prev => prev.map(log => log.id === id ? { ...log, status, message: message || log.message } : log));
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    if (!tokens) {
      connectBlogger();
      return;
    }

    setIsGenerating(true);
    setLogs([]);
    setPublishedUrl(null);
    setPreviewContent('');

    const ai = getAI();
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: `${SYSTEM_INSTRUCTIONS}\n\nIMPORTANT: The blog must be written in ${LANGUAGES.find(l => l.id === language)?.label} and have a ${tone} tone.`,
        tools: TOOLS
      }
    });

    try {
      const startLogId = addLog('Initialization', 'Starting the SEO content pipeline...');
      
      let response = await chat.sendMessage({ message: `Generate a blog post about: ${topic}` });
      updateLog(startLogId, 'success', 'Pipeline initialized.');

      let loopCount = 0;
      const MAX_LOOPS = 12;

      while (loopCount < MAX_LOOPS) {
        const functionCalls = response.functionCalls;
        if (!functionCalls) break;

        const results = [];
        for (const call of functionCalls) {
          const logId = addLog(call.name, `Executing ${call.name}...`);
          
          try {
            let result;
            if (call.name === 'generate_and_upload_image') {
              const { image_prompt, alt_text } = call.args as any;
              const imageUrl = await generateImage(image_prompt);
              result = { imageUrl, alt_text };
              updateLog(logId, 'success', 'Image generated successfully.');
            } else if (call.name === 'fetch_trending_keywords') {
              const { seed_topic } = call.args as any;
              const trends = await searchTrends(seed_topic);
              result = { trends };
              updateLog(logId, 'success', 'Trending keywords fetched.');
            } else if (call.name === 'publish_to_blogger') {
              const { title, alternative_titles, html_content, labels, status } = call.args as any;
              setPreviewContent(html_content);
              
              const publishRes = await fetch('/api/blogger/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, alternative_titles, content: html_content, labels, status, tokens })
              });
              const publishData = await publishRes.json();
              if (publishData.success) {
                result = { success: true, url: publishData.data.url, ab_test_id: publishData.data.ab_test_id };
                setPublishedUrl(publishData.data.url);
                updateLog(logId, 'success', 'Article published to Blogger with A/B testing enabled!');
                fetchAbResults(); // Refresh results
              } else {
                throw new Error(publishData.error);
              }
            }

            results.push({ name: call.name, response: result, id: call.id });
          } catch (error: any) {
            updateLog(logId, 'error', `Error: ${error.message}`);
            results.push({ name: call.name, response: { error: error.message }, id: call.id });
          }
        }

        response = await chat.sendMessage({ message: JSON.stringify(results) });
        loopCount++;
      }

      addLog('Completion', 'All steps finished. Your blog post is live!', 'success');
    } catch (error: any) {
      addLog('Error', `Pipeline failed: ${error.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <PenTool size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">BlogMaster AI</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Next-Gen SEO Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {tokens ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Blogger Active
              </div>
              <button 
                onClick={logout}
                className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                title="Disconnect Account"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button 
              onClick={connectBlogger}
              className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200 active:scale-95"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
              Sign in with Google
            </button>
          )}
          <button 
            onClick={() => setShowSetupGuide(true)}
            className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input & Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl border border-zinc-200 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-900">Create Content</h2>
              <Sparkles className="text-emerald-500" size={20} />
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Topic or Keyword</label>
                <div className="relative">
                  <input 
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Enter your blog idea..."
                    className="w-full pl-11 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium"
                  />
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Tone</label>
                  <select 
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm font-medium"
                  >
                    {TONES.map(t => (
                      <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Language</label>
                  <select 
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm font-medium"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.id} value={l.id}>{l.flag} {l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !topic.trim()}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-emerald-200 active:scale-[0.98] text-lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin" size={24} />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    {tokens ? 'Generate & Publish' : 'Sign in to Publish'}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400 mb-6">Smart Features</h3>
            <div className="space-y-5">
              {[
                { icon: Search, title: 'SEO Optimizer', desc: 'Automatic LSI keyword injection' },
                { icon: ImageIcon, title: 'Visual Studio', desc: 'AI-generated photorealistic images' },
                { icon: Globe, title: 'Global Reach', desc: 'Multi-language content support' },
                { icon: Share2, title: 'Social Sync', desc: 'Auto-generated promo posts' }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                    <item.icon size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{item.title}</h4>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Logs & Preview */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-sm flex flex-col h-[700px]">
            <div className="px-8 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => { setShowPreview(false); setShowResults(false); }}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                    (!showPreview && !showResults) ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
                  )}
                >
                  Execution Logs
                </button>
                <button 
                  onClick={() => { setShowPreview(true); setShowResults(false); }}
                  disabled={!previewContent}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                    (showPreview && !showResults) ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                  )}
                >
                  <Eye size={14} />
                  Live Preview
                </button>
                <button 
                  onClick={() => { setShowResults(true); setShowPreview(false); }}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                    showResults ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
                  )}
                >
                  <LayoutDashboard size={14} />
                  A/B Results
                </button>
              </div>
              {publishedUrl && (
                <a 
                  href={publishedUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all"
                >
                  View on Blog <ExternalLink size={14} />
                </a>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-8">
              <AnimatePresence mode="wait">
                {showResults ? (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-zinc-900">Title Performance Tracking</h3>
                      <button onClick={fetchAbResults} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                        <History size={18} className="text-zinc-400" />
                      </button>
                    </div>

                    {abResults.length === 0 ? (
                      <div className="text-center py-20 text-zinc-400">
                        <p className="font-bold">No A/B tests active</p>
                        <p className="text-sm">Publish an article to start testing titles.</p>
                      </div>
                    ) : (
                      abResults.map((test) => {
                        const totalClicks = test.clicks_a + test.clicks_b + test.clicks_c;
                        const getPercentage = (clicks: number) => totalClicks === 0 ? 0 : Math.round((clicks / totalClicks) * 100);
                        
                        return (
                          <div key={test.id} className="bg-zinc-50 rounded-2xl border border-zinc-200 p-6 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Test ID: {test.id}</span>
                              <span className="text-[10px] font-bold text-zinc-500">{new Date(test.created_at).toLocaleDateString()}</span>
                            </div>
                            
                            <div className="space-y-3">
                              {[
                                { title: test.title_a, clicks: test.clicks_a, label: 'A (Control)' },
                                { title: test.title_b, clicks: test.clicks_b, label: 'B' },
                                { title: test.title_c, clicks: test.clicks_c, label: 'C' }
                              ].map((item, i) => (
                                <div key={i} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs font-bold">
                                    <span className="text-zinc-600 truncate max-w-[70%]">{item.label}: {item.title}</span>
                                    <span className="text-zinc-900">{item.clicks} clicks ({getPercentage(item.clicks)}%)</span>
                                  </div>
                                  <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${getPercentage(item.clicks)}%` }}
                                      className={cn(
                                        "h-full rounded-full",
                                        i === 0 ? "bg-emerald-500" : i === 1 ? "bg-blue-500" : "bg-purple-500"
                                      )}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <code className="text-[9px] bg-white border border-zinc-200 px-2 py-0.5 rounded text-zinc-400 truncate">
                                      {`${process.env.APP_URL}/api/ab-test/click/${test.id}/${i}`}
                                    </code>
                                    <button 
                                      onClick={() => navigator.clipboard.writeText(`${process.env.APP_URL}/api/ab-test/click/${test.id}/${i}`)}
                                      className="text-[9px] font-bold text-emerald-600 hover:underline"
                                    >
                                      Copy Link
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </motion.div>
                ) : showPreview ? (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="prose prose-zinc max-w-none"
                  >
                    <div className="bg-zinc-50 p-8 rounded-2xl border border-zinc-100 shadow-inner min-h-full">
                      <div dangerouslySetInnerHTML={{ __html: previewContent }} />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="logs"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {logs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4 py-20">
                        <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center border border-zinc-100">
                          <History size={32} strokeWidth={1.5} />
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-zinc-900">Ready to Launch</p>
                          <p className="text-sm">Your content pipeline is standing by.</p>
                        </div>
                      </div>
                    ) : (
                      logs.map((log) => (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "p-5 rounded-2xl border transition-all flex gap-4",
                            log.status === 'success' ? "bg-emerald-50/30 border-emerald-100" :
                            log.status === 'error' ? "bg-red-50/30 border-red-100" :
                            "bg-zinc-50 border-zinc-100"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                            log.status === 'success' ? "bg-emerald-100 border-emerald-200 text-emerald-600" :
                            log.status === 'error' ? "bg-red-100 border-red-200 text-red-600" :
                            "bg-white border-zinc-200 text-zinc-400"
                          )}>
                            {log.status === 'loading' ? <Loader2 className="animate-spin" size={18} /> : 
                             log.status === 'success' ? <CheckCircle2 size={18} /> : 
                             log.status === 'error' ? <AlertCircle size={18} /> : <FileText size={18} />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{log.step}</span>
                            </div>
                            <p className={cn(
                              "text-sm font-bold",
                              log.status === 'error' ? "text-red-700" : "text-zinc-800"
                            )}>
                              {log.message}
                            </p>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {/* Setup Guide Modal */}
      <AnimatePresence>
        {showSetupGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSetupGuide(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2rem] shadow-2xl max-w-2xl w-full overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white">
                    <HelpCircle size={22} />
                  </div>
                  <h2 className="text-xl font-bold">One-Time Setup Guide</h2>
                </div>
                <button onClick={() => setShowSetupGuide(false)} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center">1</span>
                    Google Cloud Project
                  </h3>
                  <p className="text-sm text-zinc-600 pl-8">
                    Create a project in <a href="https://console.cloud.google.com/" target="_blank" className="text-emerald-600 font-bold hover:underline">Google Cloud Console</a> and enable the <strong>Blogger API v3</strong>.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center">2</span>
                    OAuth Credentials
                  </h3>
                  <p className="text-sm text-zinc-600 pl-8">
                    Create an <strong>OAuth 2.0 Client ID</strong> (Web Application). Add this redirect URI:
                    <code className="block mt-2 p-3 bg-zinc-100 rounded-lg text-xs font-mono break-all">
                      {window.location.origin}/auth/callback
                    </code>
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center">3</span>
                    Secrets Panel
                  </h3>
                  <p className="text-sm text-zinc-600 pl-8">
                    Add <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and <code>BLOGGER_BLOG_ID</code> to the AI Studio Secrets panel.
                  </p>
                </div>

                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-800 text-sm">
                  <strong>Pro Tip:</strong> Once configured, you'll never have to do this again. You can just "Sign in with Google" anytime!
                </div>
              </div>

              <div className="p-8 bg-zinc-50 border-t border-zinc-100 flex justify-end">
                <button 
                  onClick={() => setShowSetupGuide(false)}
                  className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
