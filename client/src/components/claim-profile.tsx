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
import { UserCheck, ShieldCheck, BarChart3 } from "lucide-react";

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

  // Fetch roster to check PIN status
  const { data: rosterList } = useQuery<RosterPlayer[]>({
    queryKey: ["/api/roster"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/roster");
      return res.json();
    },
  });

  const rosterEntry = rosterList?.find(
    r => r.name.toLowerCase() === player.name.toLowerCase()
  );

  // Determine state: has the player set a PIN? (= fully claimed)
  const hasPinSet = rosterEntry?.pin != null && rosterEntry.pin !== "";

  // Already fully claimed (has PIN) → show Stats link
  if (hasPinSet && player.rosterId) {
    return (
      <button
        onClick={() => navigate(`/stats/${player.rosterId}`)}
        className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:underline"
      >
        <BarChart3 className="w-3.5 h-3.5" />
        <span>Stats</span>
      </button>
    );
  }

  // Quick claim: no PIN needed, just tap to link and view stats
  const handleQuickClaim = async () => {
    if (!rosterEntry) return;
    setSubmitting(true);
    try {
      // If player doesn't have rosterId, link it via verify (no PIN needed since none is set)
      if (!player.rosterId) {
        // Use the claim endpoint without PIN requirement — we need to update the backend
        await apiRequest("POST", `/api/roster/${rosterEntry.id}/claim`, {
          playerId: player.id,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "full"] });
      toast({ title: `${player.name} claimed!`, description: "Tap Stats to view your profile." });
    } catch {
      toast({ title: "Failed to claim", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Verify PIN for returning players who already have a PIN
  const handlePinVerify = async () => {
    if (pin.length !== 4 || !rosterEntry) return;
    setSubmitting(true);
    setError("");
    try {
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
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "full"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/roster"] });
      toast({ title: "Profile verified!", description: "Game linked to your stats." });
      setOpen(false);
      setPin("");
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // Not claimed yet — show Claim button
  // If roster entry has a PIN (from a previous game), need PIN verification dialog
  // If no PIN, just quick-claim with a tap
  if (hasPinSet) {
    // Has PIN from previous claim — need to verify
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2.5"
          onClick={() => { setOpen(true); setPin(""); setError(""); }}
        >
          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
          Verify
        </Button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-xs mx-auto">
            <DialogHeader>
              <DialogTitle>Verify Identity</DialogTitle>
              <DialogDescription>
                Welcome back, {player.name}! Enter your PIN to link this game to your profile.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <InputOTP maxLength={4} value={pin} onChange={setPin} pattern="^[0-9]*$">
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                className="w-full golf-gradient text-white border-0"
                onClick={handlePinVerify}
                disabled={pin.length !== 4 || submitting}
              >
                {submitting ? "Verifying..." : "Verify & Link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // No PIN — simple one-tap claim
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs px-2.5"
      onClick={handleQuickClaim}
      disabled={submitting || !rosterEntry}
    >
      <UserCheck className="w-3.5 h-3.5 mr-1" />
      {submitting ? "..." : "Claim"}
    </Button>
  );
}
