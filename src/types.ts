export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
export type Stage = {
  id: string;
  name: string;
  position: number;
  active: boolean;
  kind: string;
  requiresTask: boolean;
  allowedFrom: string[];
};
export type CatalogEntry = {
  id: string;
  type: string;
  name: string;
  active: boolean;
  attempt: boolean;
  effectiveContact: boolean;
  noResponse: boolean;
};
export type Catalogs = {
  stages: Stage[];
  catalogs: CatalogEntry[];
  lossReasons: { id: string; name: string; active: boolean }[];
  users: User[];
};
export type Task = {
  id: string;
  title: string;
  dueAt: string;
  completedAt: string | null;
  user: { name: string };
  lead: { id: string; name: string; ownerId: string };
};
export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  rawPhone: string | null;
  reviewIssues: string[];
  email: string | null;
  source: string | null;
  stageId: string;
  stage: Stage;
  ownerId: string | null;
  owner: User | null;
  priorityId: string | null;
  priority: CatalogEntry | null;
  version: number;
  tasks: Task[];
  _count: { interactions: number };
  interactions?: {
    id: string;
    createdAt: string;
    type: string;
    note: string;
    user: { name: string };
    channel: CatalogEntry;
    result: CatalogEntry;
  }[];
  events?: {
    id: string;
    type: string;
    createdAt: string;
    user: { name: string };
    data: Record<string, unknown>;
  }[];
  conversions?: { description: string; amount: string | null }[];
  lossReason?: { name: string } | null;
};
