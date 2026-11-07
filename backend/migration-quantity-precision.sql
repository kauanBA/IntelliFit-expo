-- Precisão da quantidade: o app calcula conversões (g↔kg, ml↔L) com mais de
-- 2 casas, mas a coluna era DECIMAL(10,2) e o PostgreSQL arredondava em
-- silêncio (ex.: 1 g retirado de 1 kg ficava 1,00 kg). Com 4 casas, o valor
-- gravado é o valor calculado. Idempotente: pode rodar a cada inicialização.
ALTER TABLE foods
    ALTER COLUMN quantity TYPE NUMERIC(12,4);
