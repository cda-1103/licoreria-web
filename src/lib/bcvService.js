export const fetchBcvRate = async () => {
  try {
    const url = 'https://ve.dolarapi.com/v1/dolares/oficial';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    
    // La API devuelve el valor en la propiedad "promedio"
    const rate = parseFloat(data.promedio);
    
    if (rate && rate > 0) {
      console.log("✅ Tasa BCV actualizada:", rate);
      return rate;
    }
    
    return null;
  } catch (error) {
    console.error("❌ Error consultando DolarApi:", error);
    return null;
  }
};