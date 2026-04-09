import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { compressImage } from "@/lib/image-compress";
import { useToast } from "@/hooks/use-toast";
import { Camera, Trash2, X, Upload } from "lucide-react";
import type { GamePhoto } from "@shared/schema";

interface Props {
  gameId: number;
}

export default function Photos({ gameId }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<number | null>(null);

  const { data: photos = [] } = useQuery<GamePhoto[]>({
    queryKey: ["/api/games", gameId, "photos"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/games/${gameId}/photos`);
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const base64 = await compressImage(file);
      await apiRequest("POST", `/api/games/${gameId}/photos`, {
        data: base64,
        mimeType: "image/jpeg",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "photos"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "full"] });
      toast({ title: "Photo uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (photoId: number) => {
    if (!confirm("Delete this photo?")) return;
    try {
      await apiRequest("DELETE", `/api/photos/${photoId}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "photos"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "full"] });
      setViewPhoto(null);
      toast({ title: "Photo deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload */}
      <Card className="border-border">
        <CardContent className="p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleUpload}
          />
          {photos.length < 3 ? (
            <Button
              className="w-full h-14 golf-gradient text-white border-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <span className="animate-pulse">Uploading...</span>
              ) : (
                <>
                  <Camera className="w-5 h-5 mr-2" />
                  Add Photo ({photos.length}/3)
                </>
              )}
            </Button>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground">Maximum 3 photos reached</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map(photo => (
            <div
              key={photo.id}
              className="aspect-square rounded-lg overflow-hidden cursor-pointer border border-border hover:border-primary transition-colors"
              onClick={() => setViewPhoto(photo.id)}
            >
              <img
                src={`/api/photos/${photo.id}/image`}
                alt={photo.caption || "Game photo"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No photos yet</p>
          <p className="text-xs mt-1">Capture moments from your round</p>
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={viewPhoto !== null} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] p-1 overflow-hidden">
          {viewPhoto && (
            <div className="relative">
              <img
                src={`/api/photos/${viewPhoto}/image`}
                alt="Game photo"
                className="w-full h-auto max-h-[80vh] object-contain rounded"
              />
              <div className="absolute top-2 right-2 flex gap-1">
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8 bg-red-500/80 hover:bg-red-500"
                  onClick={() => handleDelete(viewPhoto)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
