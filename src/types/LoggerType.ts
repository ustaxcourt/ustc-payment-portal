import { ClientPermission } from "./ClientPermission";

export type LoggerType = {
  addUser: (user: { user: ClientPermission }) => void;
  debug: (message: any, context?: any) => void;
  error: (message: any, context?: any) => void;
  info: (message: any, context?: any) => void;
  warn: (message: any, context?: any) => void;
  clearContext: () => void;
  addContext: (newMeta: Record<string, any>) => void;
  getContext: () => Record<string, any>;
};
