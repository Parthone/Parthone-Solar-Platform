import {
  BarChart3,
  Boxes,
  ExternalLink,
  LayoutDashboard,
  Route,
  Settings,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'
import type { PlatformRole } from './tenant'

export type ClientNavItem = { key: string; label: string; adminOnly?: boolean }
export type ClientNavSection = { key: string; label: string; icon: typeof Users; items?: ClientNavItem[]; adminOnly?: boolean }

export const CLIENT_NAV_SECTIONS: ClientNavSection[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'journey', label: 'Customer Journey', icon: Route, items: [
    { key: 'journey-dashboard', label: 'Journey Dashboard' }, { key: 'customers', label: 'Customers' }, { key: 'followups', label: 'Follow-ups' }, { key: 'pipeline', label: 'Pipeline' }, { key: 'stage-targets', label: 'Stage Targets', adminOnly: true },
  ]},
  { key: 'sales', label: 'Sales', icon: Users, items: [
    { key: 'add-lead', label: 'Add Lead' }, { key: 'leads', label: 'Leads' }, { key: 'quotations', label: 'Quotations' }, { key: 'invoices', label: 'Invoices' }, { key: 'invoice-reports', label: 'Invoice Reports' }, { key: 'sales-followups', label: 'Follow-ups' }, { key: 'master-data', label: 'Master Data' }, { key: 'imports', label: 'Imports', adminOnly: true },
  ]},
  { key: 'inventory', label: 'Inventory', icon: Boxes, items: [
    { key: 'inventory-overview', label: 'Overview' }, { key: 'purchases', label: 'Purchases' }, { key: 'panel-inventory', label: 'Panel Inventory' }, { key: 'issues', label: 'Issues' }, { key: 'reservations', label: 'Reservations' }, { key: 'movements', label: 'Movements' }, { key: 'suppliers', label: 'Suppliers' },
  ]},
  { key: 'finance', label: 'Finance', icon: Wallet, items: [
    { key: 'expenses', label: 'Expenses' }, { key: 'expense-categories', label: 'Expense Categories' }, { key: 'account-statement-confirmation', label: 'Account Statement Confirmation' },
  ]},
  { key: 'external-links', label: 'External Links', icon: ExternalLink },
  { key: 'employees', label: 'Employees', icon: UserCog, items: [
    { key: 'user-management', label: 'User Management', adminOnly: true }, { key: 'live-tracking', label: 'Live Tracking' }, { key: 'audit-log', label: 'Audit Log', adminOnly: true }, { key: 'profile', label: 'My Profile' }, { key: 'mobile-app', label: 'Mobile Field App' },
  ]},
  { key: 'reports', label: 'Reports', icon: BarChart3, items: [
    { key: 'business-reports', label: 'Business Reports' }, { key: 'inventory-reports', label: 'Inventory Reports' },
  ]},
  { key: 'settings', label: 'Settings', icon: Settings, items: [
    { key: 'erp-studio', label: 'ERP Studio', adminOnly: true }, { key: 'roles-permissions', label: 'Role & Permissions', adminOnly: true }, { key: 'branding', label: 'Branding', adminOnly: true }, { key: 'bank-accounts', label: 'Bank Accounts' }, { key: 'task-targets', label: 'Task Targets', adminOnly: true }, { key: 'change-password', label: 'Change Password' },
  ]},
]

const permissionForKey: Record<string, string> = {
  dashboard:'dashboard', journey:'customers', 'journey-dashboard':'customers', customers:'customers', followups:'followups', 'sales-followups':'followups', pipeline:'pipeline', sales:'leads', 'add-lead':'leads', leads:'leads', quotations:'quotations', invoices:'invoices', 'invoice-reports':'invoices', 'master-data':'leads', inventory:'inventory', 'inventory-overview':'inventory', purchases:'inventory', 'panel-inventory':'inventory', issues:'inventory', reservations:'inventory', movements:'inventory', suppliers:'inventory', finance:'expenses', expenses:'expenses', 'expense-categories':'expenses', 'account-statement-confirmation':'expenses', 'external-links':'external-links', employees:'profile', 'live-tracking':'live-tracking', profile:'profile', 'mobile-app':'profile', reports:'reports', 'business-reports':'reports', 'inventory-reports':'reports', settings:'change-password', 'bank-accounts':'bank-accounts', 'change-password':'change-password',
}

export function visibleClientNavigation(role: PlatformRole, employeeModules?: readonly string[]) {
  const admin = role === 'client_admin'
  const allowed = new Set(employeeModules ?? [])
  const canSee = (key: string) => admin || !employeeModules || allowed.has(permissionForKey[key] ?? key)

  return CLIENT_NAV_SECTIONS
    .filter((section) => (!section.adminOnly || admin) && (admin || canSee(section.key) || Boolean(section.items?.some((item) => !item.adminOnly && canSee(item.key)))))
    .map((section) => ({
      ...section,
      items: section.items?.filter((item) => (!item.adminOnly || admin) && canSee(item.key)),
    }))
    .filter((section) => !section.items || section.items.length > 0)
}
