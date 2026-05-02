/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type QuestionType = 'OPEN' | 'MCQ' | 'SORTING' | 'MATCHING' | 'LIKERT';

export const STUDENTS_DATA: Record<string, string> = {
  "2025a0047@uesb.edu.br": "Rafaela Barros Oliveira",
  "2025a0053@uesb.edu.br": "Acássio Franco Gomes Ferreira",
  "2025a0052@uesb.edu.br": "Victor Araujo da Silva",
  "ingrid.ffigueira@gmail.com": "Ingrid Fernandes da Silva de Oliveira Figueira",
  "2025a0048@uesb.edu.br": "Aline Valença de Oliveira Ribas",
  "2025a0056@uesb.edu.br": "Amanda Luisa Fagundes Amorim",
  "2025a0049@uesb.edu.br": "Rosania Gomes de Paz",
  "anacristinacairesqueiroga@gmail.com": "Ana Cristina Caires Queiroga",
  "2025a0054@uesb.edu.br": "Beatriz Lima Barros",
  "2025a0051@uesb.edu.br": "Michelle de Jesus Macedo",
  "2025a0046@uesb.edu.br": "Sandy Ribeiro Pereira da Silva",
  "vejasuamaofalar@gmail.com": "Administrador do Sistema",
  "coordenacao@uesb.edu.br": "Coordenação Geral"
};

export interface Option {
  id: string;
  label: string;
}

export interface Material {
  title: string;
  description?: string;
  type: 'livro' | 'lei' | 'artigo' | 'video';
  link?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  suggestedMinutes: number;
  videoUrl?: string;              // Optional video embed URL
  options?: Option[];             // For MCQ, Likert
  correctOrder?: string[];        // For SORTING (IDs in order)
  pairs?: { [key: string]: string }; // For MATCHING (A -> B)
  correctOptionId?: string;       // For MCQ
  feedback?: { [key: string]: string } | string;
}

export interface Module {
  id: number;
  title: string;
  turn: string;
  theme: string;
  intro: string;
  materials: Material[];
  questions: Question[];
}

export const MODULES: Module[] = [
  {
    id: 0,
    title: "Módulo 1 — Sábado Manhã",
    turn: "Sábado Manhã",
    theme: "Da crise à consciência ambiental",
    intro: "Neste primeiro turno, revisitaremos as raízes históricas e os fundamentos que permitiram a emergência da Educação Ambiental. Explore os materiais abaixo para fundamentar suas reflexões sobre a transição da crise para a consciência crítica.",
    materials: [
      { title: "Educação ambiental: princípios e práticas (Caps. 1 e 2)", type: "livro", description: "DIAS, G. F." },
      { title: "Trajetória e fundamentos da educação ambiental (Caps. 1 e 2)", type: "livro", description: "LOUREIRO, C. F. B." },
      { title: "Vídeo indicado pelo professor no encontro síncrono", type: "video" }
    ],
    questions: [
      {
        id: "m1q1",
        type: "OPEN",
        prompt: "Identifique e descreva 3 marcos históricos globais decisivos para a constituição da Educação Ambiental como campo. Para cada marco, justifique sua escolha articulando com os autores lidos.",
        suggestedMinutes: 20
      },
      {
        id: "m1q2",
        type: "MCQ",
        prompt: "Qual das alternativas abaixo melhor descreve a diferença entre a perspectiva conservacionista e a perspectiva crítica de Educação Ambiental?",
        suggestedMinutes: 8,
        options: [
          { id: "a", label: "A EA conservacionista foca na preservação de recursos isolados, enquanto a crítica busca a transformação das relações sociais e produtivas." },
          { id: "b", label: "A EA crítica foca apenas na reciclagem e a conservacionista foca na economia de energia." },
          { id: "c", label: "Ambas possuem o mesmo objetivo, diferenciando-se apenas pelo público-alvo (escolas vs. empresas)." },
          { id: "d", label: "A EA conservacionista é exclusividade de biólogos e a crítica é exclusividade de sociólogos." }
        ],
        correctOptionId: "a",
        feedback: {
          "a": "Correto! A perspectiva crítica reconhece que a crise ambiental é, fundamentalmente, uma crise social e de modelo de desenvolvimento.",
          "default": "Incorreto. A principal distinção reside na profundidade da análise social e na proposta de mudança estrutural."
        }
      },
      {
        id: "m1q3",
        type: "OPEN",
        prompt: "Como você diferencia, na prática, uma ação de EA conservacionista de uma ação de EA crítica/emancipatória? Dê um exemplo do seu contexto profissional ou de pesquisa.",
        suggestedMinutes: 15
      }
    ]
  },
  {
    id: 1,
    title: "Módulo 2 — Sábado Tarde",
    turn: "Sábado Tarde",
    theme: "Conferências, princípios e metodologias",
    intro: "Daremos continuidade à nossa jornada técnica focando nos fundamentos teóricos e no legado das grandes conferências internacionais, que pavimentaram as metodologias de EA que utilizamos hoje.",
    materials: [
      { title: "Educação Ambiental: sobre princípios, metodologias e atitudes (Caps. 1 e 2)", type: "livro", description: "BARCELOS, V." },
      { title: "Trajetória e fundamentos da educação ambiental (Caps. 3 e 4)", type: "livro", description: "LOUREIRO, C. F. B." }
    ],
    questions: [
      {
        id: "m2q1",
        type: "SORTING",
        prompt: "Ordene cronologicamente as seguintes conferências internacionais:",
        suggestedMinutes: 8,
        options: [
          { id: "1972", label: "Estocolmo 1972 (Primeira grande conferência sobre o ambiente)" },
          { id: "1977", label: "Tbilisi 1977 (Primeira conferência intergovernamental sobre EA)" },
          { id: "1992", label: "Rio 92 (Cúpula da Terra e Agenda 21)" },
          { id: "2002", label: "Johannesburgo 2002 (Cúpula Mundial sobre Desenvolvimento Sustentável)" },
          { id: "2012", label: "Rio+20 2012 (Conferência sobre Desenvolvimento Sustentável)" }
        ],
        correctOrder: ["1972", "1977", "1992", "2002", "2012"],
        feedback: "A cronologia correta evidencia o amadurecimento do debate: do foco poluição (1972) à consolidação metodológica (1977) e ao desenvolvimento sustentável (90-2012)."
      },
      {
        id: "m2q2",
        type: "OPEN",
        prompt: "Construa um argumento articulando ao menos dois autores da ementa sobre a relação entre desenvolvimento econômico e educação ambiental. Há contradição ou complementaridade?",
        suggestedMinutes: 20
      },
      {
        id: "m2q3",
        type: "LIKERT",
        prompt: "Avalie as afirmações abaixo sobre os princípios metodológicos da EA segundo Barcelos (2012).",
        suggestedMinutes: 8,
        options: [
          { id: "f1", label: "A EA deve ser isolada das demais disciplinas para manter seu rigor técnico." },
          { id: "f2", label: "A EA deve promover a interdisciplinaridade e a visão sistêmica da realidade." }
        ],
        feedback: "Reflexão: Concordar com a interdisciplinaridade (afirmativa 2) demonstra alinhamento com a visão de Barcelos, que critica a fragmentação do conhecimento."
      },
      {
        id: "m2q4",
        type: "OPEN",
        prompt: "Das correntes de EA (conservacionista, pragmática, crítica/emancipatória), qual dialoga mais com sua área de pesquisa? Justifique com exemplos do seu campo.",
        suggestedMinutes: 20
      }
    ]
  },
  {
    id: 2,
    title: "Módulo 3 — Domingo Manhã",
    turn: "Domingo Manhã",
    theme: "Políticas públicas de EA no Brasil",
    intro: "Focaremos agora na base legal brasileira. A PNEA e as DCNs são os instrumentos que institucionalizam nossas práticas e definem os papéis dos diferentes atores sociais.",
    materials: [
      { title: "Lei nº 9.795/1999 — PNEA (texto integral)", type: "lei" },
      { title: "Resolução CNE/CP nº 2/2012 — DCNs para EA", type: "lei" },
      { title: "Agentes/atores envolvidos na institucionalização de políticas públicas de EA no Brasil", type: "artigo", description: "NERY-SILVA, A. C. (2016)" }
    ],
    questions: [
      {
        id: "m3q1",
        type: "MCQ",
        prompt: "Segundo a Lei 9.795/99, a Educação Ambiental:",
        suggestedMinutes: 8,
        options: [
          { id: "a", label: "Deve ser implantada como disciplina específica no currículo obrigatório." },
          { id: "b", label: "É componente essencial e permanente da educação nacional, devendo estar presente em todos os níveis e modalidades." },
          { id: "c", label: "É opcional para instituições de ensino superior privadas." },
          { id: "d", label: "Deve ser tratada como disciplina estritamente técnica e apartidária." }
        ],
        correctOptionId: "b",
        feedback: {
          "b": "Exato! O Art. 2º da Lei 9.795/99 veda a EA como disciplina específica (exceto pós-graduação), promovendo sua transversalidade.",
          "default": "Incorreto. Verifique o Art. 2º e Art. 10º da PNEA (Lei 9.795/99)."
        }
      },
      {
        id: "m3q2",
        type: "OPEN",
        prompt: "Selecione dois artigos da Lei 9.795/99 que considera mais relevantes para seu contexto de pesquisa. Explique por que os escolheu e como eles se concretizam (ou não) na realidade que você observa.",
        suggestedMinutes: 20
      },
      {
        id: "m3q3",
        type: "MATCHING",
        prompt: "Associe os atores identificados por Nery-Silva (2016) às suas funções na institucionalização da EA:",
        suggestedMinutes: 8,
        pairs: {
          "Órgão Gestor": "Coordenação nacional da PNEA (MMA/MEC)",
          "Sociedade Civil": "Pressão por políticas e controle social",
          "Universidade": "Produção de conhecimento e formação de quadros",
          "Escola": "Espaço de implementação e vivência cotidiana"
        },
        feedback: "A articulação entre esses atores é o que Nery-Silva define como o 'tecido' da institucionalização da EA no Brasil."
      },
      {
        id: "m3q4",
        type: "OPEN",
        prompt: "Que lacuna entre o texto legal e a prática real da EA você considera mais urgente de superar? Como a pesquisa acadêmica pode contribuir?",
        suggestedMinutes: 20
      }
    ]
  },
  {
    id: 3,
    title: "Módulo 4 — Domingo Tarde",
    turn: "Domingo Tarde",
    theme: "Projetos em Educação Ambiental",
    intro: "Concluímos o Portal com a aplicação prática. É hora de desenhar caminhos metodológicos e estratégias de avaliação para intervenções concretas.",
    materials: [
      { title: "Educação ambiental: princípios e práticas (Caps. sobre projetos)", type: "livro", description: "DIAS, G. F." },
      { title: "Educação Ambiental: princípios, metodologias e atitudes (Caps. sobre atitudes)", type: "livro", description: "BARCELOS, V." }
    ],
    questions: [
      {
        id: "m4q1",
        type: "MCQ",
        prompt: "Qual das características abaixo é essencial para que um projeto seja considerado de Educação Ambiental segundo as DCNs/2012?",
        suggestedMinutes: 8,
        options: [
          { id: "a", label: "Focar exclusivamente na limpeza de áreas degradadas." },
          { id: "b", label: "Abordagem crítica, participativa e dialógica sobre as questões socioambientais." },
          { id: "c", label: "Utilizar apenas tecnologias digitais de ponta." },
          { id: "d", label: "Ser financiado obrigatoriamente por ONGs internacionais." }
        ],
        correctOptionId: "b",
        feedback: {
          "b": "Correto! As DCNs enfatizam a dimensão política e ética da EA, superando o ativismo despolitizado.",
          "default": "Incorreto. A essência nas DCNs é a articulação entre conhecimento, valores e participação social."
        }
      },
      {
        id: "m4q2",
        type: "OPEN",
        prompt: "Descreva um problema socioambiental concreto do seu campo de pesquisa ou atuação que poderia ser abordado por um projeto de EA. Que público seria diretamente envolvido?",
        suggestedMinutes: 15
      },
      {
        id: "m4q3",
        type: "OPEN",
        prompt: "Defina o objetivo central e a abordagem metodológica do seu projeto (trilha, oficina, pesquisa-ação, exposição etc.). Justifique a coerência entre método, público e contexto.",
        suggestedMinutes: 20
      },
      {
        id: "m4q4",
        type: "OPEN",
        prompt: "Articule seu projeto com ao menos um autor da ementa e defina indicadores para avaliar seu impacto. Esta é sua entrega final: escreva com atenção — este campo será exportado como PDF.",
        suggestedMinutes: 30
      }
    ]
  }
];

// ============================================================
// CONFIGURAÇÃO DE DATAS E TURNOS — edite apenas este bloco
// ============================================================
export const MODULOS_CONFIG = [
  { id: 0, data: '2026-05-02', inicioHora: 9,  fimHora: 23, fimMinuto: 59 }, // Sábado Manhã (Até meia-noite)
  { id: 1, data: '2026-05-02', inicioHora: 9,  fimHora: 23, fimMinuto: 59 }, // Sábado Tarde (Liberado agora até meia-noite)
  { id: 2, data: '2026-05-03', inicioHora: 9,  fimHora: 23, fimMinuto: 59 }, // Domingo Manhã
  { id: 3, data: '2026-05-03', inicioHora: 9,  fimHora: 23, fimMinuto: 59 }, // Domingo Tarde
];
// ============================================================

export type AccessStatus = 'LOCKED' | 'AVAILABLE' | 'EXPIRED' | 'COMPLETED';

export const getModuleAccessStatus = (moduleId: number, isCompleted: boolean, overrideNow?: Date): { status: AccessStatus, timeLeft?: number, start?: Date, end?: Date } => {
  const config = MODULOS_CONFIG.find(c => c.id === moduleId);
  if (!config) return { status: 'LOCKED' };

  const now = overrideNow || new Date();
  const start = new Date(`${config.data}T${config.inicioHora.toString().padStart(2, '0')}:00:00-03:00`);
  const end = new Date(`${config.data}T${config.fimHora.toString().padStart(2, '0')}:${config.fimMinuto.toString().padStart(2, '0')}:59-03:00`);

  if (isCompleted) return { status: 'COMPLETED', start, end };
  
  if (now < start) {
    return { status: 'LOCKED', timeLeft: start.getTime() - now.getTime(), start, end };
  }
  
  if (now > end) {
    return { status: 'EXPIRED', start, end };
  }

  return { status: 'AVAILABLE', start, end };
};

export const MODULE_TOTAL_MINUTES = 150;
export const READING_MINUTES = 30;
