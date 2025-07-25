const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/* helpers -------------------------------------------------- */
const parseCookies = (h) =>
  h.cookie
    ?.split(';')
    .reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      acc[k.trim()] = decodeURIComponent(v || '');
      return acc;
    }, {}) || {};

/* ---------------------------------------------------------- */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://symbolic-cat.netlify.app',
    'Access-Control-Allow-Credentials': 'true'
  };

  try {
    /* ---------- проверяем сессию ---------- */
    const cookies = parseCookies(event.headers || {});
    const sessionId = cookies.session;
    if (!sessionId) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'UNAUTHORIZED' }) };
    }

    // получаем всех юзеров из БД
    const usersResp = await fetch(`${process.env.DB_URL}/users`, {
      headers: { token: process.env.DB_KEY }
    });
    if (!usersResp.ok) throw new Error('users fetch failed');
    const usersDB = await usersResp.json();

    // ищем владельца сессии
    let currentUser = null;
    for (const [uname, user] of Object.entries(usersDB)) {
      if (user.sessions?.some(s => s.id === sessionId && new Date(s.expires) > new Date())) {
        currentUser = { username: uname, ...user };
        break;
      }
    }
    if (!currentUser)
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'SESSION_EXPIRED' }) };

    /* ---------- добавляем комментарий ---------- */
    const { text } = JSON.parse(event.body || '{}');
    if (typeof text !== 'string' || !text.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'EMPTY_COMMENT' }) };
    }

    // получаем массив существующих чатов
    const chatsResp = await fetch(`${process.env.DB_URL}/chats`, {
      headers: { token: process.env.DB_KEY }
    });
    let chats = [];
    if (chatsResp.ok) chats = await chatsResp.json();
    else if (chatsResp.status === 404) chats = [];
    else throw new Error('chats fetch error');

    // добавляем комментарий
    chats.push(`${currentUser.username}: ${text.trim()}`);

    // отправляем обратно
    const saveResp = await fetch(`${process.env.DB_URL}/chats`, {
      method: 'POST',
      headers: { token: process.env.DB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(chats)
    });
    if (!saveResp.ok) throw new Error('could not save chats');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, chats })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
