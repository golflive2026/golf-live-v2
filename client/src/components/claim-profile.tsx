import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player, RosterPlayer } from "@shared/schema";
import { UserCheck, ShieldCheck } from "lucide-react";

interface ClaimProfileProps {
  player: Player;
  gameId: number;
}

export default function ClaimProfile({ player, gameId }: ClaimProfileProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Already claimed for this game
  if (player.rosterId) {
    return (
      <button
        onClick={() => navigate(`/stats/${player.rosterId}`)}
        className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:underline"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Stats</span>
      </button>
    );
  }

  // Find the matching roster entry by name
  const { data: rosterList } = useQuery<RosterPlayer[]>({
    queryKey: ["/api/roster"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/roster");
      return res.json();
    },
    enabled: open,
  });

  const rosterEntry = rosterList?.find(
    r => r.name.toLowerCase() === player.name.toLowerCase()
  );

  const hasPin = rosterEntry?.pin != null && rosterEntry.pin !== "";
  const isCreate = !hasPin;

  const handleSubmit = async () => {
    if (pin.length !== 4 || !rosterEntry) return;
    setSubmitting(true);
    setError("");

    try {
      if (isCreate) {
        // First time — create PIN and link
        await apiRequest("POST", `/api/roster/${rosterEntry.id}/claim`, {
          pin,
          playerId: player.id,
        });
        toast({ title: "Profile claimed!", description: "Your 4-digit PIN is set. Remember it for stats access." });
      } else {
        // Returning — verify PIN and link
        const res = await apiRequest("POST", `/api/roster/${rosterEntry.id}/verify-pin`, {
          pin,
          playerId: player.id,
        });
        const result = await res.json();
        if (!result.valid) {
          setError("Wrong PIN. Try again.");
          setPin("");
          setSubmitting(false);
          return;
        }
        toast({ title: "Profile verified!", description: "Game linked to your profile." });
      }

      // Invalidate game data so rosterId updates in UI
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "full"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/roster"] });
      setOpen(false);
      setPin("");
    } catch (e: any) {
      const msg = e?.message || "Something went wrong";
      if (msg.includes("already claimed")) {
        setError("Profile already claimed. Enter your PIN instead.");
        // Refetch roster to get updated hasPin state
        await queryClient.invalidateQueries({ queryKey: ["/api/roster"] });
        setPin("");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs px-2.5"
        onClick={() => {
          setOpen(true);
          setPin("");
          setError("");
        }}
      >
        <UserCheck className="w-3.5 h-3.5 mr-1" />
        Claim
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs mx-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreate ? "Claim Your Profile" : "Verify Identity"}
            </DialogTitle>
            <DialogDescription>
              {isCreate
                ? `Hey ${player.name}! Create a 4-digit PIN to protect your stats.`
                : `Welcome back, ${player.name}! Enter your PIN to link this game.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={setPin}
              pattern="^[0-9]*$"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>

            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              className="w-full golf-gradient text-white border-0"
              onClick={handleSubmit}
              disabled={pin.length !== 4 || submitting || !rosterEntry}
            >
              {submitting
                ? "..."
                : isCreate
                  ? "Create PIN & Claim"
                  : "Verify & Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
