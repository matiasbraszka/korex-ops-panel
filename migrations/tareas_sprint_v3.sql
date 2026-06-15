-- tareas_sprint_v3 — departamento por tarea (feedback Matias 2026-06-15)
-- Ventas / Operaciones / Programación / Marketing. Aditivo, nullable.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS department text;
CREATE INDEX IF NOT EXISTS tasks_department_idx ON public.tasks(department);
