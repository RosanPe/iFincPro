/**
 * apiService.js
 * REST client to interface with the Google Apps Script Web App backend.
 * Uses a CORS-preflight bypass by sending payloads as text/plain, which 
 * Apps Script handles seamlessly, and automatically follows redirections.
 */

export class ApiService {
  /**
   * Pulls the complete dataset from the Google Sheets API.
   * 
   * @param {string} apiUrl - The Google Apps Script deployment URL.
   * @returns {Promise<Object>} An object containing lists: { cartoes, categorias, gastos, investimentos }
   */
  static async pullData(apiUrl) {
    if (!apiUrl || !apiUrl.startsWith('http')) {
      throw new Error('URL da API do Google Sheets não configurada ou inválida.');
    }

    try {
      const url = new URL(apiUrl);
      url.searchParams.set('action', 'pull');

      const response = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Erro na requisição: Código ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'error') {
        throw new Error(result.message || 'Erro ao carregar dados do servidor.');
      }

      return result.data || { cartoes: [], categorias: [], gastos: [], investimentos: [] };
    } catch (error) {
      console.error('Erro em ApiService.pullData:', error);
      throw error;
    }
  }

  /**
   * Flushes the queued local transaction buffer to the Google Sheets API.
   * 
   * @param {string} apiUrl - The Google Apps Script deployment URL.
   * @param {Array<Object>} transactionQueue - List of transaction operations.
   * @returns {Promise<Object>} Status response from the server.
   */
  static async syncQueue(apiUrl, transactionQueue) {
    if (!apiUrl || !apiUrl.startsWith('http')) {
      throw new Error('URL da API do Google Sheets não configurada ou inválida.');
    }

    if (!transactionQueue || transactionQueue.length === 0) {
      return { status: 'success', message: 'Nenhuma transação na fila para sincronizar.' };
    }

    try {
      const payload = {
        action: 'sync',
        queue: transactionQueue
      };

      // We send this as content-type text/plain to bypass CORS preflight checks.
      // Google Apps Script can read raw POST request bodies but fails preflight OPTIONS.
      const response = await fetch(apiUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erro no envio: Código ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'error') {
        throw new Error(result.message || 'Erro durante a sincronização remota.');
      }

      return result;
    } catch (error) {
      console.error('Erro em ApiService.syncQueue:', error);
      throw error;
    }
  }
}
