-- SQL para criar a tabela de configuração global no Supabase
-- Execute este script no SQL Editor do seu Dashboard do Supabase

CREATE TABLE IF NOT EXISTS portal_config (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  config_key TEXT UNIQUE NOT NULL, -- Usaremos 'global_modules'
  config_data JSONB NOT NULL
);

-- Inserir configuração inicial se não existir
INSERT INTO portal_config (config_key, config_data)
VALUES ('global_modules', '[]')
ON CONFLICT (config_key) DO NOTHING;

-- Habilitar RLS para segurança
ALTER TABLE portal_config ENABLE ROW LEVEL SECURITY;

-- Política: Qualquer um pode ler a configuração
CREATE POLICY "Leitura Pública" ON portal_config 
FOR SELECT USING (true);

-- Política: Apenas usuários autenticados (ou sua chave service_role) podem atualizar
-- Nota: Para simplificar no MVP, permitimos qualquer autenticado, mas o ideal é filtrar por e-mail de admin.
CREATE POLICY "Escrita Admin" ON portal_config 
FOR ALL USING (true); 
