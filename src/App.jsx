import { Routes, Route } from 'react-router-dom';

// Layout
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Public pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Authenticated pages
import Dashboard from './pages/Dashboard';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderForm from './pages/PurchaseOrderForm';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import TallyExport from './pages/TallyExport';
import MasterData from './pages/MasterData';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Authenticated — wrapped in AppLayout */}
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/purchase-orders/new" element={<ProtectedRoute roles={['super_admin', 'admin', 'operations']}><PurchaseOrderForm /></ProtectedRoute>} />
        <Route path="/purchase-orders/:id/edit" element={<ProtectedRoute roles={['super_admin', 'admin', 'operations']}><PurchaseOrderForm /></ProtectedRoute>} />

        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/new" element={<ProtectedRoute roles={['super_admin', 'admin', 'operations']}><InvoiceForm /></ProtectedRoute>} />
        <Route path="/invoices/:id/edit" element={<ProtectedRoute roles={['super_admin', 'admin', 'operations']}><InvoiceForm /></ProtectedRoute>} />

        <Route path="/tally-export" element={<ProtectedRoute roles={['super_admin', 'admin', 'accounts']}><TallyExport /></ProtectedRoute>} />

        <Route path="/master-data" element={<MasterData />} />

        <Route path="/admin/users" element={<ProtectedRoute roles={['super_admin']}><UserManagement /></ProtectedRoute>} />

        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
