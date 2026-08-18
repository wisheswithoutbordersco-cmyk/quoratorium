// shopify.ts - Shopify tool for Captain Q
export async function shopifyTool(action: string, params: any) {
  const baseUrl = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-07`
  const headers = {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
    'Content-Type': 'application/json',
  }

  switch (action) {
    case 'list_products':
      const res = await fetch(`${baseUrl}/products.json?limit=10`, { headers })
      const data = await res.json()
      return { products: data.products.map((p: any) => ({
        id: p.id,
        title: p.title,
        price: p.variants?.[0]?.price,
        inventory: p.variants?.[0]?.inventory_quantity,
        status: p.status
      }))}

    case 'update_price':
      const { productId, variantId, newPrice } = params
      const update = await fetch(`${baseUrl}/variants/${variantId}.json`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ variant: { id: variantId, price: newPrice } })
      })
      return { success: update.ok, message: 'Price updated' }

    case 'create_product':
      const { title, description, price, imageUrl } = params
      const create = await fetch(`${baseUrl}/products.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          product: {
            title,
            body_html: description,
            variants: [{ price, inventory_management: 'shopify', inventory_quantity: 10 }],
            images: imageUrl ? [{ src: imageUrl }] : undefined
          }
        })
      })
      return { success: create.ok, product: await create.json() }

    default:
      return { error: `Unknown action: ${action}` }
  }
}
