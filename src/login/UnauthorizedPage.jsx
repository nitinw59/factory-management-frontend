// src/pages/UnauthorizedPage.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const UnauthorizedPage = () => {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Access Denied</h1>
      <p>You do not have permission to access this application.</p>
      <p>Please contact the administrator if you believe this is an error.</p>
      <Link to="/login">Try to log in again</Link>
    </div>
  );
};

export default UnauthorizedPage;