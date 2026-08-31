"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { qk, useInvalidator, expenseCacheKeys } from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import type {
  CreateExpenseRequest,
  CreateSettlementRequest,
  ExpenseResponse,
  SettlementIntentResponse,
  BalancesResponse,
  Settlement,
} from "@/lib/types";

export function useCreateExpenseMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: (data: CreateExpenseRequest): Promise<ExpenseResponse> => {
      return api.createExpense(groupId, data);
    },
    onSuccess: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
      toast.success("Expense created successfully");
    },
    onError: (err) => {
      handleApiError(err, "Failed to create expense");
    },
  });
}

export function useSettleBalanceMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: (data: CreateSettlementRequest): Promise<SettlementIntentResponse> => {
      return api.createSettlement(groupId, data);
    },
    onMutate: async (newSettlementData) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: qk.balances(groupId) });
      await qc.cancelQueries({ queryKey: qk.activity(groupId) });

      // Snapshot previous balances and activity/ledger
      const previousBalances = qc.getQueryData<BalancesResponse>(qk.balances(groupId));

      // Optimistically update balances if data exists
      if (previousBalances) {
        qc.setQueryData<BalancesResponse>(qk.balances(groupId), (old) => {
          if (!old) return old;
          // Subtract/add settled amount from user balance optimistically
          const amountNum = parseFloat(newSettlementData.amount || "0");
          const updatedNetBalances = old.netBalances.map((nb) => {
            if (nb.userId === newSettlementData.toUserId) {
              const currentNet = parseFloat(nb.netAmount || "0");
              return {
                ...nb,
                netAmount: (currentNet + amountNum).toFixed(2),
              };
            }
            return nb;
          });
          return {
            ...old,
            netBalances: updatedNetBalances,
          };
        });
      }

      // Also optimistically inject a pending settlement into activity/history if tracked
      const optimisticSettlementId = `opt-settlement-${Date.now()}`;
      
      return { previousBalances, optimisticSettlementId };
    },
    onError: (err, newSettlementData, context) => {
      // Roll back cache state
      if (context?.previousBalances) {
        qc.setQueryData(qk.balances(groupId), context.previousBalances);
      }
      handleApiError(err, "Failed to execute settlement");
      toast.error("Settlement failed. Balances rolled back.");
    },
    onSuccess: (data) => {
      toast.success("Settlement executed successfully");
    },
    onSettled: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.balances(groupId) });
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
    },
  });
}
