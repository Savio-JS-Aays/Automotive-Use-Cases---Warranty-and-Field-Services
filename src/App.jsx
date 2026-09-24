import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import WarrantyOverview from './modules/warranty-overview/WarrantyOverview'
import EarlyWarningSystem from './modules/early-warning-system/EarlyWarningSystem' 
import PredictiveCalibration from './modules/predictive-calibration/PredictiveCalibration.jsx' 
import DealerIntelligence from './modules/dealer-intelligence/DealerIntelligence'
import SupplierSubrogation from './modules/supplier-subrogation/SupplierSubrogation'


function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
          {/* Default redirect to Overview */}
          <Route path="/" element={<Navigate to="/overview" replace />} />
          
          {/* Module Routes */}
          <Route path="/overview" element={<WarrantyOverview />} />
          <Route path="/ews" element={<EarlyWarningSystem />} />
          <Route path="/predictive-calibration" element={<PredictiveCalibration />} />
          
          <Route 
            path="/dealer-intelligence" 
            element={<DealerIntelligence />} />
          <Route 
            path="/supplier-subrogation" 
            element={<SupplierSubrogation />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  )
}

export default App