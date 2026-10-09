-- +goose Up
-- Temporal 流程设计器：运行台账与人工待办（118 号 §11.1a 后续；OPIC-DB-SCHEMA-01 落 otechbase）

CREATE TABLE IF NOT EXISTS temporalflow_run (
  id                   BIGSERIAL PRIMARY KEY,
  def_id               BIGINT NOT NULL,
  code                 TEXT NOT NULL,
  run_id               TEXT NOT NULL UNIQUE,
  temporal_workflow_id TEXT,
  status               TEXT NOT NULL DEFAULT 'RUNNING',
  outcome              TEXT,
  vars                 JSONB,
  result               JSONB,
  error                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  ended_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tfrun_def ON temporalflow_run (def_id);

CREATE TABLE IF NOT EXISTS temporalflow_task (
  id                   BIGSERIAL PRIMARY KEY,
  temporal_workflow_id TEXT NOT NULL,
  def_id               BIGINT NOT NULL,
  run_id               TEXT NOT NULL,
  node_id              TEXT NOT NULL,
  name                 TEXT NOT NULL,
  role_ref             TEXT,
  assignee_id          BIGINT,
  assignee_name        TEXT,
  status               TEXT NOT NULL DEFAULT 'TODO', -- TODO|DONE|SLA|CANCEL
  action               TEXT,
  comment              TEXT,
  operator             TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  done_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tftask_run ON temporalflow_task (run_id);
CREATE INDEX IF NOT EXISTS idx_tftask_status ON temporalflow_task (status);

-- +goose Down
DROP TABLE IF EXISTS temporalflow_task;
DROP TABLE IF EXISTS temporalflow_run;
