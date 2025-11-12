const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

(async () => {
  const response = await fetch('http://localhost:5000/api/payments/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Programme Premium' },
            unit_amount: 4999,
          },
          quantity: 1,
        },
      ],
      customer_email: 'test@example.com',
    }),
  });
  const data = await response.json();
  console.log(data);
})();

