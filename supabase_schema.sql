CREATE TABLE respostas_alunos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  nome_aluno TEXT NOT NULL,
  email_aluno TEXT NOT NULL,
  questao_id TEXT NOT NULL,
  resposta_texto TEXT NOT NULL,
  tempo_segundos INTEGER,
  user_id UUID REFERENCES auth.users(id) -- Vinculação segura
);
