import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import WarrantyOverview from './modules/warranty-overview/WarrantyOverview'
import ClaimsAnalytics from './modules/claims-analytics/ClaimsAnalytics'
import Reliability from './modules/reliability/Reliability'
import Accountability from './modules/accountability/Accountability'


function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
          {/* Default redirect to Overview */}
          <Route path="/" element={<Navigate to="/overview" replace />} />
          
          {/* Module Routes */}
          <Route path="/overview" element={<WarrantyOverview />} />
          <Route path="/claims-analytics" element={<ClaimsAnalytics />} />
          <Route path="/reliability" element={<Reliability />} />
          {/* EWS and Predictive Calibration were merged into Reliability & Early Warning */}
          <Route path="/ews" element={<Navigate to={`/reliability?rel=${encodeURIComponent('{"tab":"reliability"}')}`} replace />} />
          <Route path="/predictive-calibration" element={<Navigate to={`/reliability?rel=${encodeURIComponent('{"tab":"reliability"}')}`} replace />} />
          
          <Route path="/accountability" element={<Accountability />} />
          {/* Dealer Intelligence and Supplier Subrogation were merged into Dealer & Supplier Accountability */}
          <Route path="/dealer-intelligence" element={<Navigate to={`/accountability?acc=${encodeURIComponent('{"tab":"dealers"}')}`} replace />} />
          <Route path="/supplier-subrogation" element={<Navigate to={`/accountability?acc=${encodeURIComponent('{"tab":"recovery"}')}`} replace />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  )
}

export default App