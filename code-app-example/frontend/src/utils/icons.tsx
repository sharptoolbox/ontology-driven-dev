import {
  Users, UserPlus, Search, ClipboardList, Inbox, CheckSquare, FileText,
  GitBranch, Workflow, List, ListChecks, Settings, User, Shield, Key, Menu,
  FilePlus, FileSpreadsheet, Banknote, BarChart3, TrendingUp, PieChart,
  AlertTriangle, Package, Building2, UserCog, Database, Circle, type LucideIcon,
} from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  Users, UserPlus, Search, ClipboardList, Inbox, CheckSquare, FileText,
  GitBranch, Workflow, List, ListChecks, Settings, User, Shield, Key, Menu,
  FilePlus, FileSpreadsheet, Banknote, BarChart3, TrendingUp, PieChart,
  AlertTriangle, Package, Building2, UserCog, Database,
}

export function MenuIcon({ name, size = 16 }: { name: string | null; size?: number }) {
  const Comp = iconMap[name || ''] || Circle
  return <Comp size={size} />
}
