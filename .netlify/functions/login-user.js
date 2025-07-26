const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const parseCookies = (headers) => {
  return headers.cookie?.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {}) || {};
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://symbolic-cat.netlify.app',
    'Access-Control-Allow-Credentials': 'true'
  };

  try {
    console.log("Login Event:", JSON.stringify({
      method: event.httpMethod,
      headers: event.headers,
      body: event.body
    }, null, 2));

    // CSRF
    const csrfHeader = event.headers['x-csrf-token'] || event.headers['X-Csrf-Token'];
    const cookies = parseCookies(event.headers);
    const csrfCookie = cookies.csrf_token;

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new Error('CSRF_ERROR: Ой что-то сломалось, попробуй еще разок');
    }

    if (!event.body) throw new Error('EMPTY_BODY: Ой что-то сломалось, попробуй еще разок');
    
    const { username, password } = JSON.parse(event.body);
    
    if (!username?.trim() || !password?.trim()) {
      throw new Error('VALIDATION: Логин/пароль обязательны');
    }

    if (!process.env.DB_URL || !process.env.DB_KEY) {
      throw new Error('CONFIG: Ой что-то сломалось :{ пиши в t.me/humans_i_am_not_human ');
    }

    // Получаем пользователей из базы данных
    const getResponse = await fetch(`${process.env.DB_URL}/users`, {
      headers: { 'token': process.env.DB_KEY }
    });
    
    if (!getResponse.ok) throw new Error(`DB_FAIL: ${getResponse.status}`);
    
    const usersDB = await getResponse.json();
    const user = usersDB[username];
    
    if (!user) throw new Error('AUTH: Неверный логин или пароль');
    
    // Проверка пароля
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) throw new Error('AUTH: Неверный логин или пароль');

    /*// создаем сессию
    const sessionId = uuidv4();const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    
    user.sessions.push({
      id: sessionId,
      expires: expiresAt.toISOString(),
      created: new Date().toISOString()
    });*/

    // Обновляем пользователя в БД
    const updateResponse = await fetch(`${process.env.DB_URL}/users`, {
      method: 'POST',
      headers: {
        'token': process.env.DB_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(usersDB)
    });

    if (!updateResponse.ok) throw new Error(`DB_UPDATE_FAIL: ${await updateResponse.text()}`);

    // ставим куки
    headers['Set-Cookie'] = 
  `username=${encodeURIComponent(username)}; Path=/; Secure; SameSite=Strict`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Вход выполнен! :3",
        username,
        fish: user.fish,
        level: user.level
      })
    };

  } catch (error) {
    console.error("Login Error:", error);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: error.message.split(':')[0] || 'AUTH_ERROR',
        message: error.message.split(':').slice(1).join(':').trim() || 'Ошибка авторизации',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
