ALTER TABLE `horario`
  ADD COLUMN `vigente_desde` date NOT NULL DEFAULT '2000-01-01',
  ADD COLUMN `vigente_hasta` date NULL,
  ADD KEY `idx_horario_comercio_vigencia` (`comercio_id`, `vigente_desde`, `vigente_hasta`),
  DROP KEY `idx_horario_comercio`,
  ADD CONSTRAINT `chk_horario_vigencia` CHECK (`vigente_hasta` IS NULL OR `vigente_hasta` >= `vigente_desde`);
