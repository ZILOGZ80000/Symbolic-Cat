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
    // ===== 0. Жёстко логируем входные данные =====
    console.log("Event:", JSON.stringify({
      method: event.httpMethod,
      headers: event.headers,
      body: event.body
    }, null, 2));

    // ===== 1. Проверка CSRF =====
    const csrfToken = event.headers['x-csrf-token'];
    const cookies = parseCookies(event.headers);
    
    if (!csrfToken || csrfToken !== cookies.csrf_token) {
      throw new Error('CSRF_ERROR: Не совпадают токены');
    }

    // ===== 2. Обрабатываем пустой body =====
    if (!event.body) {
      throw new Error('EMPTY_BODY: Тело запроса пустое');
    }
    
    const body = JSON.parse(event.body);
    const { username, password, email } = body;

    // ===== 3. Проверка обязательных полей =====
    if (!username?.trim() || !password?.trim()) {
      throw new Error('VALIDATION: Логин/пароль обязательны');
    }

    console.log("Начало регистрации для:", username);

    // ===== 4. Проверка переменных среды =====
    if (!process.env.DB_URL || !process.env.DB_KEY) {
      throw new Error('CONFIG: DB_URL/DB_KEY не настроены');
    }

    // ===== 5. Запрос к базе =====
    const getResponse = await fetch(`${process.env.DB_URL}/users`, {
      headers: { 'token': process.env.DB_KEY }
    });
    
    if (!getResponse.ok) {
      throw new Error(`DB_FAIL: ${getResponse.status} ${await getResponse.text()}`);
    }

    const usersDB = await getResponse.json();

    console.log("Текущие пользователи в БД:", Object.keys(usersDB));

    // ===== 6. Проверка существования =====
    if (usersDB[username]) {
      throw new Error('USER_EXISTS: Пользователь уже зарегистрирован');
    }

    // ===== 7. Создание пользователя =====
    const passwordHash = await bcrypt.hash(password, 10);
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    usersDB[username] = {
  email: email || null,
  password: passwordHash,
  created: new Date().toISOString(),
  fish: 0,
  level: 0,
  type: "user",
  icon: "awatar.json",
  clan: null,
  shops: {},
  friends: {},
  achievements: [],
  inactive_promocodes: [],
  sessions: [{
    id: sessionId,
    expires: expiresAt.toISOString(), 
    created: new Date().toISOString()
  }] 
}; 
    // ===== 8. Сохранение =====
    const updateResponse = await fetch(`${process.env.DB_URL}/users`, {
      method: 'POST',
      headers: {
        'token': process.env.DB_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(usersDB)
    });

    console.log("Статус обновления БД:", updateResponse.status);

    if (!updateResponse.ok) {
      throw new Error(`DB_UPDATE_FAIL: ${await updateResponse.text()}`);
    }

    // ===== 9. Ставим куки =====
    headers['Set-Cookie'] = [
      `session=${sessionId}; Path=/; Secure; SameSite=Strict; HttpOnly; Max-Age=3600`,
      `username=${encodeURIComponent(username)}; Path=/; Secure; SameSite=Strict; Max-Age=3600`
    ];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Ты зарегистрирован :3",
        username,
        fish: 0,
        level: 0
      })
    };

  } catch (error) {
    console.error("СЕРВЕРНАЯ ОШИБКА:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message.split(':')[0] || 'UNKNOWN_ERROR',
        message: error.message.split(':').slice(1).join(':').trim() || 'Неизвестная ошибка',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
