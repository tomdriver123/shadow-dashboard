export interface Town {
  id: string;
  name: string;
  description: string | null;
  coordinates: { lat: number; lng: number } | null;
  address: string | null;
  amenities: string[];
  hours: string | null;
  images: string[];
  acreage: number | null;
  rating: number | null;
}
