// src/PrivateRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function PrivateRoute({ children }) {
  const { user, showAdminView } = useAuth();
  const location = useLocation();

  // not logged in -> to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  // only admins can view admin route
  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  // admin must have toggled to admin view
  if (!showAdminView) {
    return <Navigate to="/coach-dashboard" replace />;
  }
  return children;
}

