import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { piecePartConfig } from '../../config/crudConfigs';

const PiecePartsPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manage Product Piece Parts</h1>
      <p className="text-gray-600 mb-6">
        Define the individual components or "piece parts" that make up each of your final products.
      </p>
      
      <CrudManager config={piecePartConfig} />
    </div>
  );
};

export default PiecePartsPage;
