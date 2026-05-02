-- SQL para rastrear presenÃ§a dos alunos (Online/Offline)
-- Execute este script no SQL Editor do seu Dashboard do Supabase

CREATE TABLE IF NOT EXISTS portal_presenca (
  user_email TEXT PRIMARY KEY,
  nome_aluno TEXT NOT NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE portal_presenca ENABLE ROW LEVEL SECURITY;

-- PolÃ­tica: Todos podem ver quem estÃ¡ online
CREATE POLICY "Ver presenÃ§a" ON portal_presenca 
FOR SELECT USING (true);

-- PolÃ­tica: UsuÃ¡rio pode atualizar sua prÃ³pria presenÃ§a (Upsert)
CREATE POLICY "Atualizar presenÃ§a" ON portal_presenca 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Modificar presenÃ§a" ON portal_presenca 
FOR UPDATE USING (true);
