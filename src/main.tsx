import {StrictMode, Component, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AlertCircle } from 'lucide-react';

// --- Error Boundary ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', backgroundColor: '#fef2f2', color: '#7f1d1d', fontFamily: 'sans-serif' }}>
          <div style={{ backgroundColor: 'white', padding: '32px', borderRadius: '24px', border: '1px solid #fecaca', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxWidth: '42rem', width: '100%' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
               Algo deu errado no Portal
            </h2>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#dc2626', marginBottom: '24px', backgroundColor: '#fee2e2', padding: '16px', borderRadius: '12px' }}>
              Erro: {this.state.error?.message || 'Erro desconhecido'}
            </p>
            <div style={{ marginTop: '24px' }}>
               <p style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic', marginBottom: '16px' }}>
                 "A Educação Ambiental exige persistência, inclusive técnica."
               </p>
               <button 
                 onClick={() => {
                   localStorage.clear();
                   window.location.reload();
                 }}
                 style={{ width: '100%', backgroundColor: '#374151', color: 'white', fontWeight: 700, padding: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer', marginTop: '12px' }}
               >
                 Limpar Cache e Reiniciar
               </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
