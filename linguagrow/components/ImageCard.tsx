
import React from 'react';

interface ImageCardProps {
  imageUrl: string | null;
  isLoading: boolean;
}

const ShimmerEffect: React.FC = () => (
  <div className="animate-pulse flex flex-col items-center justify-center h-full bg-gray-200 rounded-lg">
    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
    </svg>
    <span className="text-gray-400 mt-2 text-sm">Drawing a picture...</span>
  </div>
);

export const ImageCard: React.FC<ImageCardProps> = ({ imageUrl, isLoading }) => {
  if (!isLoading && !imageUrl) {
    return null;
  }

  return (
    <div className="w-full max-w-xs mx-auto aspect-square rounded-lg shadow-md bg-white p-2">
      {isLoading ? (
        <ShimmerEffect />
      ) : (
        imageUrl && <img src={imageUrl} alt="AI generated illustration" className="w-full h-full object-cover rounded-md" />
      )}
    </div>
  );
};
