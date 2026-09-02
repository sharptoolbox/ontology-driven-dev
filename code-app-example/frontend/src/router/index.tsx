import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuth } from '../stores/userStore'
import AdminLayout from '../layouts/AdminLayout'
import Login from '../pages/Login'
import MasterDataPage from '../pages/masterdata/MasterDataPage'
import ContractMaintain from '../pages/contract/ContractMaintain'
import ContractQuery from '../pages/contract/ContractQuery'
import InvoiceMaintain from '../pages/invoice/InvoiceMaintain'
import InvoiceQuery from '../pages/invoice/InvoiceQuery'
import ReceiptMaintain from '../pages/receipt/ReceiptMaintain'
import ReceiptQuery from '../pages/receipt/ReceiptQuery'
import ExecutionReport from '../pages/report/ExecutionReport'
import DeptReport from '../pages/report/DeptReport'
import UnreceivedReport from '../pages/report/UnreceivedReport'
import Todo from '../pages/workbench/Todo'
import Done from '../pages/workbench/Done'
import Requested from '../pages/workbench/Requested'
import FlowDefinitions from '../pages/flow/FlowDefinitions'
import FlowDesigner from '../pages/flow/FlowDesigner'
import FlowInstances from '../pages/flow/FlowInstances'
import FlowTasks from '../pages/flow/FlowTasks'
import UserManage from '../pages/system/UserManage'
import RoleManage from '../pages/system/RoleManage'
import PermissionManage from '../pages/system/PermissionManage'
import ResourceManage from '../pages/system/ResourceManage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { token, user, setInfo } = useAuth()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token && !user) {
      setLoading(true)
      authApi
        .info()
        .then((p) => setInfo(p))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [token, user, setInfo])

  if (!token) return <Navigate to="/login" replace />
  if (loading || !user) return <div style={{ padding: 40, color: '#5b6e8c' }}>加载中…</div>
  return <>{children}</>
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/contract/query" replace />} />
        <Route path="contract/maintain" element={<ContractMaintain />} />
        <Route path="contract/query" element={<ContractQuery />} />
        <Route path="invoice/maintain" element={<InvoiceMaintain />} />
        <Route path="invoice/query" element={<InvoiceQuery />} />
        <Route path="receipt/maintain" element={<ReceiptMaintain />} />
        <Route path="receipt/query" element={<ReceiptQuery />} />
        <Route path="report/execution" element={<ExecutionReport />} />
        <Route path="report/dept" element={<DeptReport />} />
        <Route path="report/unreceived" element={<UnreceivedReport />} />
        <Route path="masterdata/product" element={<MasterDataPage kind="product" />} />
        <Route path="masterdata/customer" element={<MasterDataPage kind="customer" />} />
        <Route path="masterdata/department" element={<MasterDataPage kind="department" />} />
        <Route path="masterdata/employee" element={<MasterDataPage kind="employee" />} />
        <Route path="workbench/todo" element={<Todo />} />
        <Route path="workbench/done" element={<Done />} />
        <Route path="workbench/requested" element={<Requested />} />
        <Route path="flow/definitions" element={<FlowDefinitions />} />
        <Route path="flow/designer/:id" element={<FlowDesigner />} />
        <Route path="flow/instances" element={<FlowInstances />} />
        <Route path="flow/tasks" element={<FlowTasks />} />
        <Route path="system/users" element={<UserManage />} />
        <Route path="system/roles" element={<RoleManage />} />
        <Route path="system/permissions" element={<PermissionManage />} />
        <Route path="system/resources" element={<ResourceManage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
