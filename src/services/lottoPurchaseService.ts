import { getBatchWithTicketsById, markBatchAsSubmitted } from "./batchService";

export async function applyBatchToLottoByToken(
  db: D1Database,
  batchId: number,
  accessToken: string,
) {
  const batchData = await getBatchWithTicketsById(db, batchId);
  if (!batchData || !batchData.batch || batchData.batch.status !== "generated") {
    throw new Error("Batch not found or not in generated status");
  }

  const tickets = batchData.tickets;
  if (!tickets || tickets.length === 0) {
    throw new Error("Batch has no tickets");
  }

  const calculatePayload = {
    drawType: "DRAW_LOTTO",
    ticketType: "REGULAR",
    tables: tickets.length,
    hasExtra: false,
    numberOfDraws: 1,
  };

  const calculateResponse = await fetch("https://api.lottosheli.com/api/v1/client/tickets/calculate", {
    method: "POST",
    headers: {
      "Authorization": `otp ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(calculatePayload),
  });

  const calculateText = await calculateResponse.text();
  if (!calculateResponse.ok) {
    throw new Error(`Failed to calculate price: ${calculateText}`);
  }

  const calculateData = JSON.parse(calculateText);
  const totalPrice = calculateData.total;

  const tablesNumbers = tickets.map((ticket) => {
    let numbers: number[];
    try {
      numbers = typeof ticket.numbers_json === "string"
        ? JSON.parse(ticket.numbers_json)
        : ticket.numbers_json || [];
    } catch {
      numbers = [];
    }

    return {
      regularNumbers: numbers,
      strongNumbers: [ticket.strong_number || 0],
    };
  });

  const duplicatePayload = {
    tickets: [
      {
        numberOfDraws: 1,
        autoRenewal: false,
        drawType: "DRAW_LOTTO",
        isExtra: false,
        tablesNumbers,
        ticketType: "REGULAR",
      },
    ],
  };

  const checkDuplicateResponse = await fetch("https://api.lottosheli.com/api/v1/client/user/tickets/check-duplicate-combination", {
    method: "POST",
    headers: {
      "Authorization": `otp ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(duplicatePayload),
  });

  const duplicateText = await checkDuplicateResponse.text();
  if (!checkDuplicateResponse.ok) {
    throw new Error(`Failed to check duplicate: ${duplicateText}`);
  }

  const checkDuplicateData = JSON.parse(duplicateText);
  if (checkDuplicateData.isDuplicateCombination === true) {
    throw new Error("Duplicate combination detected");
  }

  const payPayload = {
    transactionType: "PURCHASE",
    tickets: [
      {
        numberOfDraws: 1,
        autoRenewal: false,
        drawType: "DRAW_LOTTO",
        isExtra: false,
        tablesNumbers,
        ticketType: "REGULAR",
      },
    ],
    amountFromCredit: calculateData.total,
    amountFromDeposit: 0,
    clientUrl: "https://lottosheli.co.il",
    apiUrl: "https://api.lottosheli.com",
    useSavedCard: true,
    saveCard: true,
    uiCustomData: {},
  };

  const payResponse = await fetch("https://api.lottosheli.com/api/v1/client/payments", {
    method: "POST",
    headers: {
      "Authorization": `otp ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payPayload),
  });

  const payText = await payResponse.text();
  if (!payResponse.ok) {
    throw new Error(`Failed to pay: ${payText}`);
  }

  const payData = JSON.parse(payText);
  if (!payData.success) {
    throw new Error(`Payment failed: ${payText}`);
  }

  const batch = await markBatchAsSubmitted(db, batchId);

  return {
    ok: true,
    batchId,
    transactionId: payData.transactionId,
    totalPrice,
    status: batch?.status,
  };
}
