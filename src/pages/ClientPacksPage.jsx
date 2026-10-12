import React from 'react';
import { Navigate } from 'react-router-dom';
export default function ClientPacksPage() {
  return <Navigate to="/profile?tab=suivi" replace />;
}
