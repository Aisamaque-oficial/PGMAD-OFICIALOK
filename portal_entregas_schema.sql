-- SQL para registrar entregas finais dos alunos
-- Execute este script no SQL Editor do seu Dashboard do Supabase

CREATE TABLE IF NOT EXISTS portal_entregas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_email TEXT UNIQUE NOT NULL,
  nome_aluno TEXT NOT NULL,
  data_entrega TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE portal_entregas ENABLE ROW LEVEL SECURITY;

-- Política: Alunos podem ver sua própria entrega
CREATE POLICY "Ver própria entrega" ON portal_entregas 
FOR SELECT USING (true); -- Simplificado para leitura pública dos status

-- Política: Alunos podem inserir sua entrega
CREATE POLICY "Inserir entrega" ON portal_entregas 
FOR INSERT WITH CHECK (true);
