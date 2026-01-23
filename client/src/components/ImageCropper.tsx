import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { ZoomIn, ZoomOut, Check, X } from 'lucide-react';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}

interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function getCroppedImg(imageSrc: string, pixelCrop: PixelCrop, maxSize = 800) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Scale down if crop area is larger than maxSize
  const scale = Math.min(1, maxSize / Math.max(pixelCrop.width, pixelCrop.height));
  const outputWidth = Math.round(pixelCrop.width * scale);
  const outputHeight = Math.round(pixelCrop.height * scale);

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      'image/jpeg',
      0.85
    );
  });
}

interface Props {
  image: string;
  onCropComplete: (blob: Blob | null) => void;
  onCancel: () => void;
  aspectRatio?: number;
}

export default function ImageCropper({ image, onCropComplete, onCancel, aspectRatio = 1 }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);

  const onCropChange = useCallback((newCrop: { x: number; y: number }) => {
    setCrop(newCrop);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropCompleteCallback = useCallback(
    (_croppedArea: PixelCrop, croppedPixels: PixelCrop) => {
      setCroppedAreaPixels(croppedPixels);
    },
    []
  );

  async function handleSave() {
    if (!croppedAreaPixels) return;

    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
      onCropComplete(croppedBlob);
    } catch (err: unknown) {
      console.error('Failed to crop image:', err);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex-1 relative">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspectRatio}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropCompleteCallback}
          cropShape="rect"
          showGrid={false}
          style={{
            containerStyle: {
              background: '#1f2937',
            },
          }}
        />
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-700">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex items-center gap-4">
            <ZoomOut className="h-5 w-5 text-gray-400" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <ZoomIn className="h-5 w-5 text-gray-400" />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors"
            >
              <X className="h-5 w-5" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
            >
              <Check className="h-5 w-5" />
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
