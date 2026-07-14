import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

// Alias route helper: /store/trim-orders/:orderId → /store-manager/trim-orders/:orderId etc.
// Backend notification link_to paths use short prefixes; this maps them onto real portal routes.
const RedirectWithParams = ({ to, param = 'orderId' }) => {
    const params = useParams();
    return <Navigate to={`${to}/${params[param]}`} replace />;
};

export default RedirectWithParams;
