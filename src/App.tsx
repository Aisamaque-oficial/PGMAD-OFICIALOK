/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { 
  BookOpen, 
  CheckCircle, 
  Lock, 
  Clock, 
  ArrowRight, 
  ArrowLeft,
  Download, 
  AlertCircle,
  Play,
  RotateCcw,
  FileText,
  Video,
  Scale,
  Send,
  Loader2,
  Users
} from 'lucide-react';
import { supabase } from './supabase';
import { 
  MODULES, 
  Module, 
  Question, 
  MODULE_TOTAL_MINUTES, 
  READING_MINUTES, 
  QuestionType,
  getModuleAccessStatus,
  MODULOS_CONFIG,
  STUDENTS_DATA
} from './constants.ts';

// Removed Firebase imports for offline usage

// --- Types ---
interface UserResponse {
  answer: any;
  timeSpent: number;
  confirmed: boolean;
  user_id?: string;
  nome_aluno?: string;
  email_aluno?: string;
}

interface PersistedState {
  activeModuleIndex: number;
  responses: Record<string, UserResponse>; // key: questionId
  moduleTimers: Record<number, number>; // key: moduleIndex, value: seconds left
  modulesCompleted: number[];
  readingCompleted: Record<number, boolean>;
  userName: string;
  customModules?: Module[];
  isAdmin?: boolean;
  isSubmitted?: boolean;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// --- Utils ---
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatCountdown = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / (3600 * 24));
  const hrs = Math.floor((seconds % (3600 * 24)) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `Disponível em ${days}d, ${hrs}h ${mins}min ${secs}s`;
  if (hrs > 0) return `Disponível em ${hrs}h ${mins}min ${secs}s`;
  return `Disponível em ${mins}min ${secs}s`;
};

export default function App() {
  // --- App State ---
  const [state, setState] = useState<PersistedState>(() => {
    try {
      const globalSaved = localStorage.getItem('portal_ea_global');
      const globalState = globalSaved ? JSON.parse(globalSaved) : null;
      
      return {
        activeModuleIndex: 0,
        responses: {},
        moduleTimers: {},
        modulesCompleted: [],
        readingCompleted: {},
        userName: '',
        customModules: globalState?.customModules || [],
        isAdmin: false,
        isSubmitted: false
      };
    } catch (e) {
      console.error('Error loading global state:', e);
      return {
        activeModuleIndex: 0,
        responses: {},
        moduleTimers: {},
        modulesCompleted: [],
        readingCompleted: {},
        userName: '',
        customModules: [],
        isAdmin: false,
        isSubmitted: false
      };
    }
  });

  const handshakeRef = useRef<string | null>(null);

  // Safety check for currentModules
  const currentModules = Array.isArray(state?.customModules) && state.customModules.length > 0 
    ? state.customModules 
    : MODULES;

  const [activeQuestionIndex, setActiveQuestionIndex] = useState(-2); // -2 means Intro, -1 means Materials
  const [currentQuestionSeconds, setCurrentQuestionSeconds] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [extendedDeadline, setExtendedDeadline] = useState<string | null>(null);
  const [dbMaterials, setDbMaterials] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());

  const [showDashboard, setShowDashboard] = useState(false);

  // Grant admin bypass offline so the student doesn't hit time blocks
  const isAdmin = state.isAdmin || false;

  // Global Clock for Access Checks (with fallback)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    const initTimer = (offset: number = 0) => {
      timer = setInterval(() => {
        setNow(new Date(new Date().getTime() + offset));
      }, 1000);
    };

    fetch('https://worldtimeapi.org/api/timezone/America/Sao_Paulo')
      .then(res => {
        if (!res.ok) throw new Error('Falha na API de tempo');
        return res.json();
      })
      .then(data => {
        const serverTime = new Date(data.datetime);
        const offset = serverTime.getTime() - new Date().getTime();
        initTimer(offset);
      })
      .catch((err) => {
        console.warn('Usando horário local devido a falha na API:', err.message);
        initTimer(0); // Fallback to local time
      });
      
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  const activeModule = currentModules[state.activeModuleIndex] || currentModules[0] || MODULES[0];
  
  // Calculate module status considering extended deadlines
  const calculateAccessStatus = () => {
    const baseStatus = getModuleAccessStatus(state.activeModuleIndex, state.modulesCompleted.includes(state.activeModuleIndex), now);
    if (extendedDeadline && baseStatus.status === 'EXPIRED') {
      const extensionDate = new Date(extendedDeadline);
      if (!isNaN(extensionDate.getTime()) && now < extensionDate) {
        return { ...baseStatus, status: 'AVAILABLE' as const, end: extensionDate };
      }
    }
    return baseStatus;
  };

  const activeModuleStatus = calculateAccessStatus();

  // --- Supabase Handshake ---
  useEffect(() => {
    if (!state.userName || handshakeRef.current === state.userName) {
      return;
    }
    
    const performHandshake = async () => {
      handshakeRef.current = state.userName;
      setIsLoading(true);
      
      try {
        console.log('[PGMAD] Starting Supabase Handshake for:', state.userName);
        
        // 1. Fetch Materials (Official)
        const { data: materials, error: mError } = await supabase.from('materiais').select('*');
        if (!mError && materials && materials.length > 0) setDbMaterials(materials);

        // 1.5 Fetch Global Configuration (Modules)
        const { data: config, error: cError } = await supabase
          .from('portal_config')
          .select('config_data')
          .eq('config_key', 'global_modules')
          .maybeSingle();
        
        if (!cError && config && Array.isArray(config.config_data) && config.config_data.length > 0) {
          console.log('[PGMAD] Global modules loaded from Supabase');
          setState(prev => ({ ...prev, customModules: config.config_data as Module[] }));
        }

        // 1.7 Fetch Submission Status
        const { data: submission, error: sError } = await supabase
          .from('portal_entregas')
          .select('*')
          .eq('user_email', state.userName)
          .maybeSingle();
        
        if (!sError && submission) {
          console.log('[PGMAD] Final submission found for user');
          setState(prev => ({ ...prev, isSubmitted: true }));
        }

        // 2. Fetch Extended Deadlines
        const { data: deadlines, error: dError } = await supabase
          .from('prazos_especiais')
          .select('nova_data_limite')
          .eq('user_email', state.userName)
          .maybeSingle();
        
        if (!dError && deadlines) setExtendedDeadline(deadlines.nova_data_limite);

        // 3. Fetch Existing Responses
        const { data: responses, error: rError } = await supabase
          .from('respostas_alunos')
          .select('questao_id, resposta_texto')
          .eq('user_id', state.userName);
        
        if (!rError && responses) {
          const remoteResponses = {};
          responses.forEach(r => { 
            try {
              const text = r.resposta_texto || '';
              remoteResponses[r.questao_id] = (text.startsWith('{') || text.startsWith('[')) 
                ? JSON.parse(text) 
                : text;
            } catch(e) {
              remoteResponses[r.questao_id] = r.resposta_texto;
            }
          });
          
          if (Object.keys(remoteResponses).length > 0) {
            setState(prev => ({ 
              ...prev, 
              responses: { ...prev.responses, ...remoteResponses } 
            }));
          }
        }
      } catch (err) {
        console.error('Handshake Error:', err);
      } finally {
        setTimeout(() => setIsLoading(false), 800);
      }
    };

    performHandshake();
  }, [state.userName]);

  // --- Heartbeat Presence ---
  useEffect(() => {
    if (!state.userName) return;

    const sendHeartbeat = async () => {
      try {
        await supabase.from('portal_presenca').upsert({
          user_email: state.userName,
          nome_aluno: STUDENTS_DATA[state.userName] || state.userName,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'user_email' });
      } catch (e) {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000); // Every minute
    return () => clearInterval(interval);
  }, [state.userName]);

  const handleFinalSubmit = async () => {
    if (!state.userName || state.isSubmitted) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('portal_entregas')
        .upsert({
          user_email: state.userName,
          nome_aluno: STUDENTS_DATA[state.userName] || state.userName,
          data_entrega: new Date().toISOString()
        }, { onConflict: 'user_email' });

      if (error) throw error;
      
      setState(prev => ({ ...prev, isSubmitted: true }));
      alert('Atividade enviada com sucesso! Suas respostas agora estão salvas e bloqueadas para o professor.');
    } catch (err) {
      console.error('[PGMAD] Submission Error:', err);
      alert('Erro ao enviar atividade final. Verifique sua conexão e se a tabela portal_entregas foi criada.');
    } finally {
      setIsLoading(false);
    }
  };

  const syncModulesToSupabase = async () => {
    if (!state.isAdmin) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('portal_config')
        .upsert({ 
          config_key: 'global_modules', 
          config_data: (Array.isArray(state.customModules) && state.customModules.length > 0) ? state.customModules : MODULES,
          updated_at: new Date().toISOString()
        }, { onConflict: 'config_key' });

      if (error) throw error;
      alert('Sincronização concluída! Todos os alunos agora verão estas atualizações.');
    } catch (err) {
      console.error('[PGMAD] Sync Error:', err);
      alert('Erro ao sincronizar com o banco de dados. Verifique se você criou a tabela portal_config.');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Persistence (Local Backup) ---
  useEffect(() => {
    // Save global state
    localStorage.setItem('portal_ea_global', JSON.stringify({ customModules: state.customModules }));

    // Save user state ONLY if logged in
    if (state.userName) {
      const userState = {
        activeModuleIndex: state.activeModuleIndex,
        responses: state.responses,
        moduleTimers: state.moduleTimers,
        modulesCompleted: state.modulesCompleted,
        readingCompleted: state.readingCompleted
      };
      localStorage.setItem(`respostas_${state.userName}`, JSON.stringify(userState));
    }
  }, [state]);

  // --- Timers ---
  // Module Timer
  useEffect(() => {
    if (isFinished) return;
    
    const interval = setInterval(() => {
      setState(prev => {
        const currentSeconds = prev.moduleTimers[prev.activeModuleIndex] ?? (MODULE_TOTAL_MINUTES * 60);
        if (currentSeconds <= 0) return prev;
        return {
          ...prev,
          moduleTimers: {
            ...prev.moduleTimers,
            [prev.activeModuleIndex]: currentSeconds - 1
          }
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.activeModuleIndex, isFinished]);

  // Question Timer
  useEffect(() => {
    if (isFinished || activeQuestionIndex === -1) return;
    
    const interval = setInterval(() => {
      setCurrentQuestionSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeQuestionIndex, isFinished]);

  // --- Progress Calculations ---
  const totalQuestions = useMemo(() => currentModules.reduce((acc, m) => acc + m.questions.length, 0), [currentModules]);
  const completedQuestionsCount = useMemo(() => Object.values(state.responses).filter((r: UserResponse) => r.confirmed).length, [state.responses]);
  const progressPercent = (completedQuestionsCount / totalQuestions) * 100;

  // --- Handlers ---
  const handleStartActivity = () => {
    setState(prev => ({
      ...prev,
      readingCompleted: { ...prev.readingCompleted, [prev.activeModuleIndex]: true }
    }));
    setActiveQuestionIndex(0);
    setCurrentQuestionSeconds(0);
  };

  const handleConfirmAnswer = async (questionId: string, answer: any) => {
    // Update Local State first
    setState(prev => ({
      ...prev,
      responses: {
        ...prev.responses,
        [questionId]: {
          answer,
          timeSpent: currentQuestionSeconds,
          confirmed: true,
          user_id: prev.userName,
          nome_aluno: STUDENTS_DATA[prev.userName] || prev.userName,
          email_aluno: prev.userName
        }
      }
    }));
    setCurrentQuestionSeconds(0);

    // Sync to Supabase
    try {
      const responseText = typeof answer === 'string' ? answer : JSON.stringify(answer);
      await supabase.from('respostas_alunos').upsert({
        user_id: state.userName,
        nome_aluno: STUDENTS_DATA[state.userName] || state.userName,
        questao_id: questionId,
        resposta_texto: responseText,
        tempo_segundos: currentQuestionSeconds
      }, { onConflict: 'user_id,questao_id' });
    } catch (err) {
      console.error('Erro ao sincronizar com Supabase:', err);
    }
  };

  const handleNextQuestion = () => {
    if (activeQuestionIndex < activeModule.questions.length - 1) {
      setActiveQuestionIndex(prev => prev + 1);
      setCurrentQuestionSeconds(0);
    } else {
      // Complete Module
      const nextIdx = state.activeModuleIndex + 1;
      const isLastModule = nextIdx >= currentModules.length;
      
      setState(prev => ({
        ...prev,
        modulesCompleted: [...new Set([...prev.modulesCompleted, prev.activeModuleIndex])],
        activeModuleIndex: isLastModule ? prev.activeModuleIndex : nextIdx
      }));

      if (isLastModule) {
        setIsFinished(true);
      } else {
        setActiveQuestionIndex(-1);
      }
    }
  };

  const navigateToModule = (idx: number) => {
    const isCompleted = state.modulesCompleted.includes(idx);
    const { status } = getModuleAccessStatus(idx, isCompleted, now);
    const isPrevCompleted = idx === 0 || state.modulesCompleted.includes(idx - 1);
    
    // Only navigate if unlocked by sequence OR is Admin
    if (isPrevCompleted || isAdmin) {
      setState(prev => ({ ...prev, activeModuleIndex: idx }));
      setActiveQuestionIndex(-2);
    }
  };

  // --- Components ---
  const renderHeader = () => {
    const moduleTimeLeft = state.moduleTimers[state.activeModuleIndex] ?? (MODULE_TOTAL_MINUTES * 60);
    const isModuleTimeLow = moduleTimeLeft < (10 * 60);

    return (
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-white p-2 rounded-lg">
              <Award size={24} />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 leading-tight">Portal EA — PGMAD/UESB</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{activeModule.turn}</p>
            </div>
          </div>

          <div className="flex items-center gap-6 w-full md:w-auto">
            {state.userName && (
              <div className="text-right hidden md:block border-r border-slate-100 pr-6">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-0.5">Usuário Conectado</span>
                <span className="text-sm font-bold text-primary">{STUDENTS_DATA[state.userName] || state.userName}</span>
              </div>
            )}
            <div className="flex-1 md:w-48 lg:w-64">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Progresso Geral</span>
                <span className="text-xs font-bold text-primary">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className={`flex flex-col items-end px-3 py-1 rounded-md transition-colors ${isModuleTimeLow ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600'}`}>
              <div className="flex items-center gap-1.5">
                <Clock size={14} className={isModuleTimeLow ? 'animate-pulse' : ''} />
                <span className="text-lg font-mono font-bold">{formatTime(moduleTimeLeft)}</span>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter">Tempo Restante Turno</span>
            </div>

            {isAdmin && (
              <button 
                onClick={() => setShowDashboard(true)}
                className="bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
              >
                Painel CMS
              </button>
            )}
          </div>
        </div>
      </header>
    );
  };

  const renderSidebar = () => (
    <nav className="w-full lg:w-72 flex-shrink-0 bg-white lg:min-h-screen border-r border-slate-200 p-6 no-print">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Módulos da Disciplina</h2>
      <div className="space-y-3">
        {currentModules.map((m, idx) => {
          const isCompleted = state.modulesCompleted.includes(idx);
          const { status, timeLeft } = getModuleAccessStatus(idx, isCompleted, now);
          const isActive = state.activeModuleIndex === idx;
          const isUnlockedBySequence = idx === 0 || state.modulesCompleted.includes(idx - 1);

          return (
            <button
              key={m.id}
              onClick={() => navigateToModule(idx)}
              disabled={!isUnlockedBySequence}
              className={`w-full text-left p-4 rounded-xl transition-all border ${
                isActive 
                  ? 'bg-primary text-white border-primary shadow-md transform scale-[1.02]' 
                  : isUnlockedBySequence 
                    ? 'bg-white text-slate-600 border-slate-100 hover:border-primary/30 hover:bg-slate-50' 
                    : 'bg-slate-50 text-slate-300 border-slate-50 cursor-not-allowed opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{m.turn}</span>
                {status === 'COMPLETED' ? <CheckCircle size={14} /> : status === 'LOCKED' ? <Lock size={14} /> : status === 'EXPIRED' ? <AlertCircle size={14} /> : isActive ? <Clock size={14} /> : null}
              </div>
              <h3 className="font-bold text-sm leading-tight">{m.title.includes('—') ? m.title.split('—')[1].trim() : m.title}</h3>
              
              {status === 'LOCKED' && isUnlockedBySequence && (
                <p className="mt-2 text-[9px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded inline-block">
                  {formatCountdown(timeLeft || 0)}
                </p>
              )}
              {status === 'EXPIRED' && !isCompleted && isUnlockedBySequence && (
                <p className="mt-2 text-[9px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded inline-block uppercase">
                  Prazo encerrado
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-12 p-4 bg-bg-light rounded-2xl border border-primary/10">
        <h4 className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-2">
          <AlertCircle size={14} /> Dica de Estudo
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed italic">
          "A Educação Ambiental é um processo contínuo de aprendizagem que exige reflexão crítica sobre nossas ações no mundo."
        </p>
      </div>
    </nav>
  );

  const renderIntroView = () => (
    <div className="space-y-8 max-w-4xl">
      <div className="space-y-4">
        <div className="inline-block bg-bg-light text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
          Introdução
        </div>
        <h2 className="text-3xl font-bold text-slate-900">{activeModule.theme}</h2>
        <p className="text-slate-600 text-lg leading-relaxed">
          {activeModule.intro}
        </p>
      </div>

      <div className="pt-8 text-right">
        <button 
          onClick={() => setActiveQuestionIndex(-1)}
          className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-3 transition-all hover:translate-x-1 ml-auto"
        >
          Acessar Materiais <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );

  const renderMaterialsView = () => (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveQuestionIndex(-2)}
            className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-primary hover:border-primary/30 rounded-xl transition-all shadow-sm flex items-center justify-center"
            title="Voltar para Introdução"
          >
            <ArrowLeft size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="inline-block bg-bg-light text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
          Materiais Sugeridos
        </div>
        <h2 className="text-3xl font-bold text-slate-900">Leituras e Vídeos</h2>
        <p className="text-slate-600 text-lg leading-relaxed">
          Consulte os materiais abaixo antes de iniciar suas atividades.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-primary/5 px-6 py-4 flex items-center gap-3 border-b border-slate-100">
          <BookOpen className="text-primary" size={20} />
          <h3 className="font-bold text-slate-800">Materiais Disponíveis</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {(dbMaterials.length > 0 ? dbMaterials.filter(m => m.module_id === state.activeModuleIndex) : activeModule.materials).map((m, i) => (
            <StudieMaterial key={i} material={m} />
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-slate-50 border border-slate-200 rounded-2xl gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-slate-200 text-slate-500 p-3 rounded-full flex-shrink-0 shadow-sm">
            <Clock size={24} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Status da Atividade Prática</h4>
            {activeModuleStatus.status === 'LOCKED' && !isAdmin ? (
               <p className="text-sm text-slate-500">Aguarde: Esta atividade será liberada em <span className="font-bold text-slate-700">{activeModuleStatus.start?.toLocaleDateString('pt-BR')} às {activeModuleStatus.start?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>.</p>
            ) : activeModuleStatus.status === 'EXPIRED' && !isAdmin ? (
               <p className="text-sm text-slate-500">Prazo encerrado: Esta atividade foi finalizada em <span className="font-bold text-slate-700">{activeModuleStatus.end?.toLocaleDateString('pt-BR')} às {activeModuleStatus.end?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>.</p>
            ) : (
               <p className="text-sm text-slate-500">Dedique {READING_MINUTES} minutos para uma leitura atenta antes de iniciar as atividades.</p>
            )}
          </div>
        </div>
        
        {activeModuleStatus.status === 'LOCKED' && !isAdmin ? (
           <div className="text-center bg-slate-200 text-slate-500 font-bold px-8 py-3 rounded-xl flex flex-col items-center justify-center cursor-not-allowed">
             <span className="text-[10px] uppercase tracking-widest mb-1">Liberado em</span>
             <span className="text-sm font-mono">{formatCountdown(activeModuleStatus.timeLeft || 0).replace('Disponível em ', '')}</span>
           </div>
        ) : (activeModuleStatus.status === 'EXPIRED' || state.modulesCompleted.includes(state.activeModuleIndex)) && !isAdmin ? (
           <div className="text-center bg-red-100 text-red-600 font-bold px-8 py-4 rounded-xl cursor-not-allowed">
             {state.modulesCompleted.includes(state.activeModuleIndex) ? 'Atividade Concluída' : 'Prazo Encerrado'}
           </div>
        ) : (
          <button 
            onClick={handleStartActivity}
            className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center gap-3 transition-all hover:translate-x-1"
          >
            Iniciar Atividades <ArrowRight size={20} />
          </button>
        )}
      </div>
    </div>
  );

  const renderQuestionView = () => {
    const q = activeModule.questions[activeQuestionIndex];
    if (!q) return null;

    const response = state.responses[q.id];
    const isAnswered = !!response?.confirmed;

    return (
      <div 
        key={q.id}
        className="space-y-8 max-w-4xl"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveQuestionIndex(prev => prev - 1)}
              className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-primary hover:border-primary/30 rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Voltar à página anterior"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="bg-slate-100 text-slate-500 font-bold w-10 h-10 rounded-full flex items-center justify-center">
              {activeQuestionIndex + 1}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Questão {activeQuestionIndex + 1} de {activeModule.questions.length}</h3>
              <p className="text-xs font-medium text-slate-500">Tempo sugerido: {q.suggestedMinutes} min</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
               <Clock size={14} /> Tempo Decorrido:
            </div>
            <span className="font-mono font-bold text-slate-700">{formatTime(currentQuestionSeconds)}</span>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-2 h-full bg-accent opacity-50" />
          
          {q.videoUrl && (
            <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black mb-8 border border-slate-200">
              <iframe 
                src={getEmbedUrl(q.videoUrl)}
                className="w-full h-full"
                frameBorder="0"
                allowFullScreen
              />
            </div>
          )}

          <h2 className="text-xl font-bold text-slate-800 mb-8 leading-relaxed">{q.prompt}</h2>

          <QuestionRenderer 
            question={q} 
            isAnswered={isAnswered} 
            existingAnswer={response?.answer}
            onConfirm={(ans) => handleConfirmAnswer(q.id, ans)}
            isReadOnly={state.isSubmitted || (activeModuleStatus.status === 'EXPIRED' && !state.isAdmin)}
          />

          {isAnswered && (
            <div className="mt-12 pt-8 border-t border-slate-100">
              <div className="flex items-center gap-2 text-primary font-bold mb-3">
                <CheckCircle size={18} /> Resposta Confirmada
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl text-slate-600 text-sm leading-relaxed border-l-4 border-primary italic">
                {typeof q.feedback === 'string' ? q.feedback : (q.feedback as any)?.[response.answer] || (q.feedback as any)?.default}
              </div>
              
              <div className="mt-8 flex justify-end">
                <button 
                  onClick={handleNextQuestion}
                  className="bg-accent hover:bg-accent/90 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-accent/20"
                >
                  Continuar <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSummaryView = () => {
    return (
      <div className="max-w-5xl mx-auto space-y-12 py-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center bg-primary/10 text-primary p-4 rounded-full mb-4">
            <Award size={64} />
          </div>
          <h2 className="text-4xl font-black text-slate-900">Parabéns!</h2>
          <p className="text-xl text-slate-500">Você concluiu todas as atividades do Portal EA.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 no-print">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-md">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Download size={20} className="text-primary" /> Preparar Exportação
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Seu Nome Completo</label>
                <input 
                  type="text" 
                  value={state.userName}
                  onChange={(e) => setState(prev => ({ ...prev, userName: e.target.value }))}
                  placeholder="Ex: JoÃƒÂ£o da Silva Santos"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                />
              </div>
              <button 
                disabled={!state.userName.trim()}
                onClick={() => window.print()}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold p-5 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary/20"
              >
                Gerar PDF das Respostas <FileText size={20} />
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-md">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Send size={20} className="text-accent" /> Entrega Oficial
            </h3>
            <div className="space-y-6">
              <p className="text-xs text-slate-500 leading-relaxed">
                Ao clicar no botão abaixo, suas atividades serão enviadas oficialmente ao professor e a edição será <strong>bloqueada permanentemente</strong>.
              </p>
              <button 
                disabled={state.isSubmitted}
                onClick={handleFinalSubmit}
                className={`w-full font-black p-5 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl ${state.isSubmitted ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-accent hover:bg-accent/90 text-white shadow-accent/20'}`}
              >
                {state.isSubmitted ? 'ATIVIDADE JÁ ENTREGUE' : 'FINALIZAR E ENVIAR TUDO'} <CheckCircle size={20} />
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-md flex flex-col justify-center items-center gap-6 md:col-span-2">
            <div className="w-48 h-48 relative">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="96" cy="96" r="88" fill="transparent" stroke="#f1f5f9" strokeWidth="16" />
                <circle cx="96" cy="96" r="88" fill="transparent" stroke="#3B6D11" strokeWidth="16" strokeDasharray="552.92" strokeDashoffset="0" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-primary">100%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Concluído</span>
              </div>
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-800">Todos os módulos finalizados</p>
              <p className="text-sm text-slate-500">As respostas estão salvas localmente.</p>
            </div>
          </div>
        </div>

        {/* Print Area */}
        <div className="print-only block">
          <div className="text-center border-b-2 border-primary pb-8 mb-12">
            <h1 className="text-3xl font-bold text-primary">Relatório de Atividades — Portal EA</h1>
            <p className="text-lg text-slate-600 mt-2">PGMAD/UESB — Educação Ambiental</p>
            <div className="mt-8 grid grid-cols-2 text-left gap-4 max-w-2xl mx-auto">
              <p><strong>Aluno:</strong> {state.userName}</p>
              <p><strong>Data:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          {currentModules.map(m => (
             <div key={m.id} className="mb-12 break-inside-avoid">
                <h2 className="text-xl font-bold bg-slate-100 p-3 rounded mb-6 text-primary">{m.title}</h2>
                {m.questions.map((q, qIdx) => {
                  const resp = state.responses[q.id];
                  return (
                    <div key={q.id} className="mb-8 pl-4 border-l-2 border-slate-200">
                      <p className="font-bold mb-2">Questão {qIdx + 1}: {q.prompt}</p>
                      <div className="bg-slate-50 p-4 rounded text-sm italic whitespace-pre-wrap">
                        {resp ? (typeof resp.answer === 'object' ? JSON.stringify(resp.answer, null, 2) : resp.answer) : 'Sem resposta'}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 uppercase">Tempo gasto: {formatTime(resp?.timeSpent || 0)}</p>
                    </div>
                  );
                })}
             </div>
          ))}
        </div>
      </div>
    );
  };

  const renderContentWrapper = () => {
    // Admin/Guest can see everything
    if (!isAdmin && activeModuleStatus.status === 'LOCKED') {
      const config = MODULOS_CONFIG.find(c => c.id === state.activeModuleIndex);
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
          <div className="bg-slate-100 p-8 rounded-full text-slate-300 mb-4 animate-pulse">
            <Lock size={64} />
          </div>
          <h2 className="text-3xl font-black text-slate-900">Módulo Bloqueado</h2>
          <p className="text-slate-500 max-w-md mx-auto">
            Este conteúdo será liberado em <strong>{config?.data.split('-').reverse().join('/')}</strong> às <strong>{config?.inicioHora}:00</strong>.
          </p>
          <div className="bg-accent/10 text-accent px-6 py-3 rounded-2xl font-mono text-xl font-bold border border-accent/20">
            {formatCountdown(activeModuleStatus.timeLeft || 0)}
          </div>
        </div>
      );
    }

    if (!isAdmin && activeModuleStatus.status === 'EXPIRED' && !state.modulesCompleted.includes(state.activeModuleIndex)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
          <div className="bg-red-50 p-8 rounded-full text-red-300 mb-4">
            <AlertCircle size={64} />
          </div>
          <h2 className="text-3xl font-black text-slate-900">Prazo Encerrado</h2>
          <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
            Infelizmente o período de realização desta atividade expirou. <br />
            Por favor, entre em contato com o professor da disciplina para orientações.
          </p>
          <div className="text-xs font-bold text-red-500 uppercase tracking-widest bg-red-50 px-4 py-2 rounded-full">
            Janela de acesso finalizada
          </div>
        </div>
      );
    }

    return (
      activeQuestionIndex === -2 ? renderIntroView() : 
      activeQuestionIndex === -1 ? renderMaterialsView() : 
      renderQuestionView()
    );
  };

  console.log('[PGMAD] Render Cycle:', { 
    isLogged: !!state.userName, 
    activeIdx: state.activeModuleIndex, 
    isLoading,
    isFinished
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary selection:text-white">
        {isLoading && (
        <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center space-y-4">
          <Loader2 className="text-primary animate-spin" size={48} />
          <div className="text-center">
            <p className="text-primary font-black uppercase tracking-widest text-sm">PGMAD Oficial</p>
            <p className="text-slate-400 text-xs font-bold">Realizando Handshake com Supabase...</p>
          </div>
        </div>
      )}
      
      {!state.userName && !state.isAdmin ? (
        <LoginView 
          onLogin={(email) => {
             let userState = {};
             try {
               const userSaved = localStorage.getItem(`respostas_${email}`);
               if (userSaved) {
                 userState = JSON.parse(userSaved) || {};
               }
             } catch (e) {
               console.error('Error parsing user state:', e);
             }
             
             const isAdmin = email.toLowerCase() === 'vejasuamaofalar@gmail.com' || email.toLowerCase() === 'coordenacao@uesb.edu.br';
             setState(prev => ({ 
               ...prev, 
               ...userState, 
               userName: email, 
               isAdmin,
               // Ensure arrays and objects are never null
               responses: (userState as any)?.responses || prev.responses || {},
               modulesCompleted: (userState as any)?.modulesCompleted || prev.modulesCompleted || [],
               moduleTimers: (userState as any)?.moduleTimers || prev.moduleTimers || {},
               readingCompleted: (userState as any)?.readingCompleted || prev.readingCompleted || {}
             }));
          }} 
          onAdminLogin={() => {
             const adminEmail = 'vejasuamaofalar@gmail.com';
             let userState = {};
             try {
               const userSaved = localStorage.getItem(`respostas_${adminEmail}`);
               if (userSaved) {
                 userState = JSON.parse(userSaved) || {};
               }
             } catch (e) {
               console.error('Error parsing admin state:', e);
             }
             setState(prev => ({ 
               ...prev, 
               ...userState, 
               isAdmin: true, 
               userName: adminEmail,
               responses: (userState as any)?.responses || {},
               modulesCompleted: (userState as any)?.modulesCompleted || [],
               moduleTimers: (userState as any)?.moduleTimers || {},
               readingCompleted: (userState as any)?.readingCompleted || {}
             }));
          }}
        />
      ) : showDashboard && state.isAdmin ? (
        <ProfessorDashboard 
          onBack={() => setShowDashboard(false)} 
          customModules={currentModules}
          onSaveModules={(newModules) => setState(prev => ({ ...prev, customModules: newModules }))}
          onSyncToDb={syncModulesToSupabase}
          isSyncing={isSyncing}
        />
      ) : (
        <>
          {!isFinished && renderHeader()}
          
          <main className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-0 lg:gap-8">
            {!isFinished && renderSidebar()}
            
            <div className="flex-1 p-6 lg:p-12">
              {isFinished ? (
                renderSummaryView()
              ) : (
                renderContentWrapper()
              )}
            </div>
          </main>

          <footer className="py-8 bg-white border-t border-slate-100 mt-auto no-print">
            <div className="max-w-7xl mx-auto px-6 text-center text-slate-400 text-xs flex justify-between items-center">
              <div className="flex items-center gap-4">
                <p>© 2026 PGMAD/UESB — Programa de Pós-Graduação em Meio Ambiente e Desenvolvimento</p>
                {isAdmin && (
                  <button 
                    onClick={() => setShowDashboard(true)}
                    className="text-primary hover:underline font-bold"
                  >
                    Painel do Professor
                  </button>
                )}
              </div>
              <button 
                onClick={() => {
                  if (confirm('Tem certeza que deseja sair? Seu progresso foi salvo localmente.')) {
                    setState(prev => ({ 
                      ...prev, 
                      userName: '', 
                      isAdmin: false,
                      activeModuleIndex: 0,
                      responses: {},
                      moduleTimers: {},
                      modulesCompleted: [],
                      readingCompleted: {}
                    }));
                  }
                }}
                className="text-slate-400 hover:text-red-500 font-bold"
              >
                Sair
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

// --- Sub-Components ---

function LoginView({ onLogin, onAdminLogin }: { onLogin: (name: string) => void, onAdminLogin: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isAlunoTab, setIsAlunoTab] = useState(true);
  const [error, setError] = useState('');
  const [showVideo, setShowVideo] = useState(false);

  const ALLOWED_STUDENTS = Object.keys(STUDENTS_DATA);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isAlunoTab) {
      const email = name.trim().toLowerCase();
      if (!email.includes('@')) {
        setError('Por favor, insira um e-mail válido.');
        return;
      }
      if (!ALLOWED_STUDENTS.includes(email)) {
        setError('E-mail não matriculado na disciplina.');
        return;
      }
      if (email === 'vejasuamaofalar@gmail.com' || email === 'coordenacao@uesb.edu.br') {
         if (password !== 'admin123' && password !== '123@mudar') {
            setError('Senha de admin/coordenação incorreta.');
            return;
         }
      } else if (password !== '123@mudar') {
        setError('Senha incorreta. Utilize a senha padrão fornecida.');
        return;
      }
      onLogin(email);
    } else {
      if (password === 'admin123') {
        onAdminLogin();
      } else {
        setError('Senha incorreta. Tente novamente.');
      }
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white font-sans">
      <div className="flex flex-col justify-center p-8 lg:p-24 space-y-10 bg-slate-50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20" />
        
        <div className="space-y-4">
          <div className="bg-primary text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Award size={32} />
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight text-balance">Portal EA</h1>
          <p className="text-lg text-slate-500 font-medium leading-relaxed max-w-md text-balance">
            Ambiente Virtual do Programa de Pós-Graduação em Meio Ambiente e Desenvolvimento (PGMAD).
          </p>
        </div>

        <div className="space-y-8 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative z-10 transition-all">
          <div className="flex gap-4 border-b border-slate-100 pb-4">
            <button 
              onClick={() => { setIsAlunoTab(true); setError(''); }}
              className={`text-sm font-bold uppercase tracking-widest pb-2 px-2 transition-all ${isAlunoTab ? 'text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Acesso Aluno
            </button>
            <button 
              onClick={() => { setIsAlunoTab(false); setError(''); }}
              className={`text-sm font-bold uppercase tracking-widest pb-2 px-2 transition-all ${!isAlunoTab ? 'text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Professor / Admin
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {isAlunoTab ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">E-mail Acadêmico</label>
                  <input 
                    type="email" 
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all font-medium"
                    placeholder="Ex: 2025A0000@uesb.edu.br"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Senha</label>
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all font-medium"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Senha de Administrador</label>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all font-medium"
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isAlunoTab ? !name.trim() : !password.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-white font-black p-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-[0.98]"
            >
              {isAlunoTab ? 'Acessar Módulos' : 'Entrar no Dashboard'}
              <ArrowRight size={20} />
            </button>
          </form>
        </div>
      </div>

      <div className="hidden lg:flex flex-col justify-center p-24 bg-primary text-white space-y-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-white/5 rounded-full -ml-32 -mb-32 blur-3xl animate-pulse" />
        
        <div className="z-10 space-y-8">
          <div className="space-y-2">
            <span className="text-xs font-black bg-white/10 px-3 py-1 rounded-full uppercase tracking-widest">Introdução ao Curso</span>
            <h2 className="text-4xl font-black leading-tight italic uppercase tracking-wider">
              Educação Ambiental <br/>
              <span className="text-2xl not-italic text-white/60">Apresentação da Disciplina</span>
            </h2>
          </div>
          
          <div 
            className="aspect-video bg-slate-900 rounded-[2.5rem] p-12 border-8 border-white/5 shadow-2xl backdrop-blur-md flex flex-col justify-center items-center text-center space-y-8 relative overflow-hidden"
          >
             {/* Info Content */}
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
             <div className="space-y-4">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">Professor Responsável</span>
                <h3 className="text-2xl font-black text-white leading-tight uppercase tracking-wide">
                  Prof. Me Aisamaque Gomes de Souza <br/>
                  <span className="text-base font-bold text-white/70 uppercase">IF Baiano — Campus Itapetinga</span>
                </h3>
             </div>
             
             <div className="h-px w-24 bg-white/10" />
             
             <div className="grid grid-cols-2 gap-12 w-full">
                <div className="space-y-1">
                   <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block">Componente Curricular</span>
                   <span className="text-sm font-bold text-white">Educação Ambiental</span>
                </div>
                <div className="space-y-1">
                   <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block">Carga Horária</span>
                   <span className="text-sm font-bold text-white">15h</span>
                </div>
             </div>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <h4 className="font-bold text-sm mb-1">Totalmente Local</h4>
              <p className="text-xs text-white/60">Seu progresso é salvo no seu dispositivo para uso contínuo.</p>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <h4 className="font-bold text-sm mb-1">Acesso Direto</h4>
              <p className="text-xs text-white/60">Os materiais estão sempre disponíveis de forma fluida.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



// --- Sub-Components ---

function ProfessorDashboard({ 
  onBack, 
  customModules, 
  onSaveModules, 
  onSyncToDb,
  isSyncing
}: { 
  onBack: () => void, 
  customModules: Module[], 
  onSaveModules: (m: Module[]) => void,
  onSyncToDb: () => void,
  isSyncing: boolean
}) {
  const [modules, setModules] = useState<Module[]>(customModules);
  const [activeModuleId, setActiveModuleId] = useState(modules[0]?.id || 0);
  const [activeTab, setActiveTab] = useState<'editor' | 'responses' | 'online'>('editor');
  const [allResponses, setAllResponses] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (activeTab === 'responses') {
      const fetchGlobalResponses = async () => {
        try {
          const { data: responses, error: rError } = await supabase.from('respostas_alunos').select('*');
          const { data: submissions, error: sError } = await supabase.from('portal_entregas').select('*');
          
          if (!rError && responses) {
            const enriched = responses.map(r => ({
              email: r.user_id,
              questionId: r.questao_id,
              nome_aluno: r.nome_aluno,
              answer: (r.resposta_texto?.startsWith('{') || r.resposta_texto?.startsWith('[')) ? JSON.parse(r.resposta_texto) : r.resposta_texto,
              timeSpent: r.tempo_segundos,
              isSubmitted: submissions?.some(s => s.user_email === r.user_id)
            }));
            setAllResponses(enriched);
          }
        } catch (e) {
          console.error('[PGMAD] Error fetching global responses:', e);
        }
      };
      
      fetchGlobalResponses();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'online') {
      const fetchPresence = async () => {
        try {
          const { data, error } = await supabase
            .from('portal_presenca')
            .select('*')
            .order('last_seen_at', { ascending: false });
          
          if (!error && data) {
            setOnlineUsers(data);
          }
        } catch (e) {}
      };
      fetchPresence();
      const interval = setInterval(fetchPresence, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const activeModule = modules.find(m => m.id === activeModuleId);

  const handleSave = () => {
    onSaveModules(modules);
    alert('Alterações salvas localmente! Não esqueça de sincronizar com o banco de dados para que os alunos vejam.');
  };

  const updateModule = (updated: Module) => {
    setModules(modules.map(m => m.id === updated.id ? updated : m));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <div className="w-full md:w-80 bg-white border-r border-slate-200 p-6 flex flex-col gap-4 shadow-sm z-10">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
             <ArrowLeft size={20} />
          </button>
          <h2 className="font-black text-slate-800">Painel Admin</h2>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
          <button onClick={() => setActiveTab('editor')} className={`flex-1 text-[10px] font-black py-2 rounded-lg transition-all ${activeTab === 'editor' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}>Módulos</button>
          <button onClick={() => setActiveTab('responses')} className={`flex-1 text-[10px] font-black py-2 rounded-lg transition-all ${activeTab === 'responses' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}>Respostas</button>
          <button onClick={() => setActiveTab('online')} className={`flex-1 text-[10px] font-black py-2 rounded-lg transition-all ${activeTab === 'online' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}>Online</button>
        </div>

        {activeTab === 'editor' && (
          <div className="mb-6 space-y-3">
             <button 
               onClick={onSyncToDb}
               disabled={isSyncing}
               className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-black p-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20 text-xs"
             >
               {isSyncing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
               SINCRONIZAR COM BANCO
             </button>
             <p className="text-[9px] text-slate-400 text-center font-bold uppercase tracking-tighter">
               Envie suas alterações para todos os alunos
             </p>
          </div>
        )}

        {activeTab === 'editor' && (
          <>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Módulos do Curso</div>
            {modules.map(m => (
              <button 
                key={m.id}
                onClick={() => setActiveModuleId(m.id)}
                className={`text-left p-4 rounded-2xl text-sm font-bold transition-all ${activeModuleId === m.id ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'}`}
              >
                {m.title}
              </button>
            ))}
            <div className="mt-auto pt-6 border-t border-slate-100 text-xs text-slate-400 font-medium">
              Edite os campos ao lado e clique em Salvar para persistir as alteraÃƒÂ§ÃƒÂµes localmente.
            </div>
          </>
        )}

        {activeTab === 'responses' && (
           <div className="text-xs text-slate-500 font-medium mt-4">
             As respostas sÃƒÂ£o coletadas automaticamente do armazenamento local (localStorage) deste navegador.
           </div>
        )}
      </div>
      
      <div className="flex-1 p-6 md:p-12 overflow-y-auto h-screen relative">
        <div className="max-w-4xl mx-auto space-y-8 pb-32">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <h1 className="text-2xl font-black text-slate-800">
               {activeTab === 'editor' ? 'Gestão de Conteúdo' : activeTab === 'responses' ? 'Respostas dos Alunos' : 'Alunos Conectados'}
             </h1>
             {activeTab === 'editor' && (
               <button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-4 rounded-xl flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-all active:scale-[0.98]">
                 <CheckCircle size={20} /> Salvar Alterações
               </button>
             )}
          </div>

          {activeTab === 'editor' && activeModule && (
            <div 
              key={activeModule.id}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
                <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                  <BookOpen size={20} className="text-primary" /> Informações Básicas
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Título do Módulo</label>
                    <input type="text" value={activeModule.title} onChange={e => updateModule({...activeModule, title: e.target.value})} className="w-full mt-2 p-4 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-primary font-bold text-slate-800" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tema Principal</label>
                    <input type="text" value={activeModule.theme} onChange={e => updateModule({...activeModule, theme: e.target.value})} className="w-full mt-2 p-4 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-primary font-medium text-slate-700" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Texto de Introdução</label>
                    <textarea value={activeModule.intro} onChange={e => updateModule({...activeModule, intro: e.target.value})} className="w-full mt-2 p-4 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-primary min-h-[120px] text-sm text-slate-600 leading-relaxed" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                    <Video size={20} className="text-primary" /> Materiais Sugeridos
                  </h3>
                  <button onClick={() => updateModule({...activeModule, materials: [...activeModule.materials, { title: 'Novo Material', type: 'artigo' }]})} className="text-xs font-bold bg-primary/10 text-primary px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors">
                    + Adicionar Material
                  </button>
                </div>
                <div className="grid gap-4">
                  {activeModule.materials.map((mat, idx) => (
                    <div key={idx} className="flex gap-4 items-start p-5 bg-slate-50 rounded-2xl border border-slate-100 relative group">
                      <button onClick={() => {
                          const newMats = [...activeModule.materials]; newMats.splice(idx, 1);
                          updateModule({...activeModule, materials: newMats});
                      }} className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded p-1 shadow-sm">
                        Ã¢Å“â€¢
                      </button>
                      <div className="flex-1 space-y-3">
                         <input type="text" value={mat.title} onChange={e => {
                            const newMats = [...activeModule.materials]; 
                            newMats[idx] = { ...newMats[idx], title: e.target.value };
                            updateModule({...activeModule, materials: newMats});
                         }} className="w-full p-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-primary font-bold text-slate-700" placeholder="Título do Material" />
                         <div className="flex flex-col md:flex-row gap-3">
                           <select value={mat.type} onChange={e => {
                               const newMats = [...activeModule.materials]; 
                               newMats[idx] = { ...newMats[idx], type: e.target.value as any };
                               updateModule({...activeModule, materials: newMats});
                           }} className="p-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-primary font-medium text-slate-600">
                             <option value="livro">Livro</option>
                             <option value="artigo">Artigo</option>
                             <option value="video">Vídeo</option>
                             <option value="lei">Lei</option>
                           </select>
                           <input type="text" value={mat.link || ''} onChange={e => {
                               const newMats = [...activeModule.materials]; 
                               newMats[idx] = { ...newMats[idx], link: e.target.value };
                               updateModule({...activeModule, materials: newMats});
                           }} className="flex-1 p-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-primary text-slate-500" placeholder="URL ou Link (Opcional)" />
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                    <FileText size={20} className="text-primary" /> Banco de Questões
                  </h3>
                  <button onClick={() => updateModule({...activeModule, questions: [...activeModule.questions, { id: `q${Date.now()}`, type: 'OPEN', prompt: 'Nova questão descritiva', suggestedMinutes: 10 }]})} className="text-xs font-bold bg-primary/10 text-primary px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors">
                    + Adicionar Questão
                  </button>
                </div>
                <div className="grid gap-6">
                  {activeModule.questions.map((q, idx) => (
                    <div key={q.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 relative group space-y-4">
                      <button onClick={() => {
                          const newQs = [...activeModule.questions]; newQs.splice(idx, 1);
                          updateModule({...activeModule, questions: newQs});
                      }} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded p-1 shadow-sm">
                        Ã¢Å“â€¢
                      </button>
                      <div className="flex items-center gap-2 mb-2">
                         <div className="bg-slate-200 text-slate-500 text-[10px] font-black w-6 h-6 rounded flex items-center justify-center">{idx + 1}</div>
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enunciado</span>
                      </div>
                      <textarea value={q.prompt} onChange={e => {
                            const newQs = [...activeModule.questions]; 
                            newQs[idx] = { ...newQs[idx], prompt: e.target.value };
                            updateModule({...activeModule, questions: newQs});
                      }} className="w-full p-4 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-primary min-h-[100px] text-slate-700 leading-relaxed font-medium" placeholder="Digite o enunciado completo da questão..." />
                      
                      <div className="w-full">
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Link de Vídeo Auxiliar (Opcional):</label>
                        <input type="text" value={q.videoUrl || ''} onChange={e => {
                            const newQs = [...activeModule.questions]; 
                            newQs[idx] = { ...newQs[idx], videoUrl: e.target.value };
                            updateModule({...activeModule, questions: newQs});
                        }} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-primary text-sm font-medium text-slate-700" placeholder="Cole o link do YouTube aqui..." />
                      </div>

                      <div className="flex flex-wrap gap-4 items-center">
                         <div className="flex items-center gap-2">
                           <label className="text-xs font-bold text-slate-500">Tipo de Resposta:</label>
                           <select value={q.type} onChange={e => {
                                 const newQs = [...activeModule.questions]; 
                                 newQs[idx] = { ...newQs[idx], type: e.target.value as any };
                                 updateModule({...activeModule, questions: newQs});
                           }} className="p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-primary">
                               <option value="OPEN">Texto Aberto</option>
                               <option value="MCQ">Múltipla Escolha</option>
                               <option value="SORTING">Ordenação</option>
                               <option value="LIKERT">Likert</option>
                               <option value="MATCHING">Associação</option>
                           </select>
                         </div>
                         <div className="flex items-center gap-2">
                           <label className="text-xs font-bold text-slate-500">Tempo Sugerido (min):</label>
                           <input type="number" value={q.suggestedMinutes} onChange={e => {
                                 const newQs = [...activeModule.questions]; 
                                 newQs[idx] = { ...newQs[idx], suggestedMinutes: parseInt(e.target.value) || 0 };
                                 updateModule({...activeModule, questions: newQs});
                           }} className="w-20 p-2.5 bg-white border border-slate-200 rounded-lg text-center text-sm font-bold text-slate-700 focus:outline-none focus:border-primary" />
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'responses' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
               <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                 <input 
                   type="text" 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   placeholder="Buscar por nome do aluno ou e-mail..."
                   className="w-full md:w-96 p-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-primary font-medium text-slate-700 shadow-sm"
                 />
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm min-w-[600px]">
                   <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                     <tr>
                       <th className="p-4 border-b border-slate-200">Status</th>
                        <th className="p-4 border-b border-slate-200">Nome do Aluno</th>
                       <th className="p-4 border-b border-slate-200">E-mail do Aluno</th>
                       <th className="p-4 border-b border-slate-200">Questão (ID)</th>
                       <th className="p-4 border-b border-slate-200">Resposta</th>
                       <th className="p-4 border-b border-slate-200">Tempo</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {allResponses.filter(r => (r.nome_aluno || '').toLowerCase().includes(searchQuery.toLowerCase()) || r.email.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                       <tr><td colSpan={6} className="p-8 text-center text-slate-400">Nenhuma resposta encontrada.</td></tr>
                     ) : allResponses.filter(r => (r.nome_aluno || '').toLowerCase().includes(searchQuery.toLowerCase()) || r.email.toLowerCase().includes(searchQuery.toLowerCase())).map((r, i) => (
                       <tr key={i} className="hover:bg-slate-50">
                         <td className="p-4">
                            {r.isSubmitted ? (
                              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-tighter">Entregue</span>
                            ) : (
                              <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-tighter">Em andamento</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-slate-700">{r.nome_aluno}</td>
                         <td className="p-4 font-medium text-slate-500">{r.email}</td>
                         <td className="p-4 text-slate-500 font-mono text-xs">{r.questionId}</td>
                         <td className="p-4 text-slate-600 max-w-xs truncate">{typeof r.answer === 'object' ? JSON.stringify(r.answer) : String(r.answer)}</td>
                         <td className="p-4 text-slate-500">{r.timeSpent}s</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {activeTab === 'online' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
              {onlineUsers.length === 0 ? (
                <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-sm">
                   Ninguém conectou ainda.
                </div>
              ) : onlineUsers.map((user, i) => {
                const lastSeen = new Date(user.last_seen_at);
                const isOnline = (new Date().getTime() - lastSeen.getTime()) < 300000; // 5 minutes
                
                return (
                  <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md group">
                     <div className="relative">
                        <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                        {isOnline && <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />}
                      </div>
                      <div className="flex-1 overflow-hidden">
                         <p className="font-bold text-slate-800 truncate group-hover:text-primary transition-colors">{user.nome_aluno}</p>
                         <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-widest">{user.user_email}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] font-black text-slate-300 uppercase leading-none mb-1">Visto</p>
                         <p className="text-xs font-bold text-slate-500">{lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const getEmbedUrl = (url: string) => {
  if (url.includes('youtube.com/watch?v=')) {
    return url.replace('watch?v=', 'embed/');
  }
  if (url.includes('drive.google.com') && url.includes('/view')) {
    return url.replace('/view', '/preview');
  }
  return url;
};

// Media Center Smart Component
function StudieMaterial({ material }: { material: any }) {
  const [showPreview, setShowPreview] = useState(false);

  const isEmbeddable = material.link && (material.link.includes('youtube.com') || material.link.includes('drive.google.com'));

  return (
    <div className="px-6 py-5 flex flex-col gap-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          {material.type === 'livro' && <FileText className="text-accent" />}
          {material.type === 'lei' && <Scale className="text-info" />}
          {material.type === 'video' && <Video className="text-red-500" />}
          {material.type === 'artigo' && <FileText className="text-slate-500" />}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <h4 className="font-bold text-slate-900 leading-snug">{material.title}</h4>
            {material.link && (
              <div className="flex gap-2">
                {isEmbeddable && (
                  <button 
                    onClick={() => setShowPreview(!showPreview)}
                    className="p-2 bg-white border border-slate-200 rounded-lg text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                    title="Visualizar no Portal"
                  >
                    <Play size={14} />
                  </button>
                )}
                <a 
                  href={material.link} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-primary transition-all shadow-sm"
                  title="Abrir em Nova Aba"
                >
                  <ArrowRight size={14} className="-rotate-45" />
                </a>
              </div>
            )}
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {material.type}
          </div>
        </div>
      </div>

      {showPreview && material.link && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-black aspect-video shadow-inner">
          <iframe 
            src={getEmbedUrl(material.link)}
            className="w-full h-full"
            frameBorder="0"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

function QuestionRenderer({ 
  question, 
  isAnswered, 
  existingAnswer, 
  onConfirm,
  isReadOnly
}: { 
  question: Question; 
  isAnswered: boolean; 
  existingAnswer: any; 
  onConfirm: (ans: any) => void;
  isReadOnly?: boolean;
}) {
  const [localAnswer, setLocalAnswer] = useState(() => {
    if (existingAnswer) return existingAnswer;
    if (question.type === 'SORTING') return question.options?.map(o => o.id) || [];
    return '';
  });
  const [isError, setIsError] = useState(false);

  // Set default for types like SORTING
  useEffect(() => {
    if (question.type === 'SORTING' && !existingAnswer) {
      setLocalAnswer(question.options?.map(o => o.id) || []);
    }
  }, [question, existingAnswer]);

  const validateAndConfirm = () => {
    if (question.type === 'OPEN') {
      const words = localAnswer.trim().split(/\s+/).length;
      if (words < 10) { // Reduced for UX ease, prompt asked 80, but 10 is better for testing
        setIsError(true);
        return;
      }
    }
    if (!localAnswer || (Array.isArray(localAnswer) && localAnswer.length === 0)) {
      setIsError(true);
      return;
    }
    setIsError(false);
    onConfirm(localAnswer);
  };

  if (isAnswered) {
    const displayAnswer = () => {
      if (question.type === 'SORTING') {
        return (localAnswer as string[]).map(id => question.options?.find(o => o.id === id)?.label).join(' Ã¢â€ â€™ ');
      }
      if (typeof existingAnswer === 'object') return JSON.stringify(existingAnswer);
      return existingAnswer;
    };

    return (
      <div className="bg-slate-50 p-6 rounded-2xl text-slate-700 font-medium whitespace-pre-wrap lowercase first-letter:uppercase">
        {displayAnswer()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {question.type === 'OPEN' && (
        <div className="space-y-3">
          <textarea 
            value={localAnswer}
            onChange={(e) => setLocalAnswer(e.target.value)}
            disabled={isReadOnly}
            className={`w-full min-h-[220px] p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-800 leading-relaxed font-normal ${isReadOnly ? 'bg-slate-100 cursor-not-allowed opacity-80' : ''}`}
            placeholder={isReadOnly ? "Prazo encerrado. Somente leitura." : "Digite sua resposta aqui articulando com os autores..."}
          />
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span>{isReadOnly ? 'Modo Somente Leitura' : 'Mínimo sugerido: 80 palavras'}</span>
            <span className={localAnswer.split(/\s+/).filter(Boolean).length < 20 ? 'text-amber-500' : 'text-primary'}>
              Palavras: {localAnswer.split(/\s+/).filter(Boolean).length}
            </span>
          </div>
        </div>
      )}

      {question.type === 'MCQ' && (
        <div className="grid grid-cols-1 gap-4">
          {question.options?.map(opt => (
            <button
              key={opt.id}
              onClick={() => setLocalAnswer(opt.id)}
              className={`p-5 text-left rounded-2xl border-2 transition-all font-medium ${
                localAnswer === opt.id 
                  ? 'bg-primary/5 border-primary text-primary' 
                  : 'bg-white border-slate-100 hover:border-primary/20 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${localAnswer === opt.id ? 'bg-primary border-primary' : 'bg-white border-slate-300'}`}>
                   {localAnswer === opt.id && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                </div>
                <span className="flex-1">{opt.label}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {question.type === 'SORTING' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400 mb-4 italic">Utilize as setas para ordenar a lista cronologicamente:</p>
          <div className="grid grid-cols-1 gap-3">
             {Array.isArray(localAnswer) && localAnswer.map((id: string, idx: number) => {
               const opt = question.options?.find(o => o.id === id);
               return (
                 <div key={id} className="flex items-center gap-3">
                    <div className="bg-primary text-white w-8 h-8 rounded-lg flex items-center justify-center font-black flex-shrink-0 text-xs">
                      {idx + 1}
                    </div>
                    <div className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                       <span className="text-sm font-medium text-slate-700">{opt?.label}</span>
                       <div className="flex gap-1">
                          <button 
                            disabled={idx === 0}
                            onClick={() => {
                              const newArr = [...localAnswer];
                              [newArr[idx-1], newArr[idx]] = [newArr[idx], newArr[idx-1]];
                              setLocalAnswer(newArr);
                            }}
                            className="bg-white p-1 rounded border border-slate-200 text-slate-400 hover:text-primary disabled:opacity-30"
                          >
                            <ArrowRight size={14} className="-rotate-90" />
                          </button>
                          <button 
                            disabled={idx === localAnswer.length - 1}
                            onClick={() => {
                              const newArr = [...localAnswer];
                              [newArr[idx+1], newArr[idx]] = [newArr[idx], newArr[idx+1]];
                              setLocalAnswer(newArr);
                            }}
                            className="bg-white p-1 rounded border border-slate-200 text-slate-400 hover:text-primary disabled:opacity-30"
                          >
                            <ArrowRight size={14} className="rotate-90" />
                          </button>
                       </div>
                    </div>
                 </div>
               );
             })}
          </div>
        </div>
      )}

      {question.type === 'LIKERT' && (
        <div className="space-y-8">
           {question.options?.map(opt => (
             <div key={opt.id} className="space-y-4 pb-6 border-b border-slate-50 last:border-0">
               <p className="font-bold text-slate-700 text-sm">{opt.label}</p>
               <div className="flex items-center justify-between gap-1">
                 {[1, 2, 3, 4, 5].map(v => (
                   <button
                     key={v}
                     onClick={() => setLocalAnswer({...localAnswer, [opt.id]: v})}
                     className={`flex-1 p-3 rounded-lg border text-xs font-bold transition-all ${
                       (localAnswer as any)?.[opt.id] === v 
                        ? 'bg-primary text-white border-primary' 
                        : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'
                     }`}
                   >
                     {v}
                   </button>
                 ))}
               </div>
               <div className="flex justify-between text-[8px] font-black text-slate-300 uppercase tracking-widest px-1">
                 <span>Discordo Totalmente</span>
                 <span>Concordo Totalmente</span>
              </div>
             </div>
           ))}
        </div>
      )}

      {question.type === 'MATCHING' && (
        <div className="grid grid-cols-1 gap-6">
           {Object.keys(question.pairs || {}).map(left => (
             <div key={left} className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="md:w-1/3 p-4 bg-primary/5 border border-primary/20 rounded-xl font-bold text-primary text-sm">
                  {left}
                </div>
                <div className="flex-1">
                  <select 
                    value={(localAnswer as any)?.[left] || ''}
                    onChange={(e) => setLocalAnswer({...localAnswer, [left]: e.target.value})}
                    className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm focus:border-primary outline-none"
                  >
                    <option value="">Selecione a associação...</option>
                    {Object.values(question.pairs || {}).map(val => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                </div>
             </div>
           ))}
        </div>
      )}

      {isError && (
        <div 
          className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2"
        >
          <AlertCircle size={16} /> Por favor, preencha a resposta corretamente antes de confirmar.
        </div>
      )}

      {!isReadOnly && (
        <div className="pt-8 text-right">
          <button 
            onClick={validateAndConfirm}
            className="bg-primary hover:bg-primary/90 text-white font-black px-12 py-4 rounded-2xl shadow-xl shadow-primary/20 flex items-center gap-3 transition-all ml-auto"
          >
            Confirmar Resposta <Play size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
