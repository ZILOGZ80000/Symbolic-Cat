// functions/register-user.js
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Парсим куки из заголовков
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
    // ======= 1. CSRF-проверка =======
    const csrfToken = event.headers['x-csrf-token'];
    const cookies = parseCookies(event.headers);
    
    if (!csrfToken || csrfToken !== cookies.csrf_token) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Ошибка безопасности CSRF' })
      };
    }

    // ======= 2. Проверка метода =======
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Разрешены только POST-запросы' })
      };
    }

    // ======= 3. Парсинг данных =======
    const { username, password, email } = JSON.parse(event.body);
    
    // ======= 4. Валидация =======
    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Логин и пароль обязательны!' })
      };
    }

    // ======= 5. Хеширование пароля =======
    const passwordHash = await bcrypt.hash(password, 10);

    // ======= 6. Проверка переменных окружения =======
    if (!process.env.DB_URL || !process.env.DB_KEY) {
      throw new Error('Ошибка конфигурации базы данных');
    }

    // ======= 7. Получение существующих пользователей =======
    const getResponse = await fetch(`${process.env.DB_URL}/users`, {
      method: 'GET',
      headers: { 'token': process.env.DB_KEY }
    });
    
    if (!getResponse.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Ошибка подключения к базе' })
      };
    }

    const usersDB = await getResponse.json();

    // ======= 8. Проверка существующего пользователя =======
    if (usersDB[username]) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Пользователь уже существует!' })
      };
    }

    // ======= 9. Создание нового пользователя =======
    usersDB[username] = {
      // Основные данные
      email: email || null,
      password: passwordHash,
      created: new Date().toISOString(),
      
      // Игровые характеристики
      fish: 0,
      level: 0,
      type: "user",
      icon: "awatar.json",
      clan: null,
      
      // Системные данные
      shops: {},         // Пример: { "shop1": true, "shop2": false }
      friends: {},       // Пример: { "user2": "pending", "user3": "accepted" }
      achievements: [],  // Пример: ["first_win", "collector"]
      inactive_promocodes: [], // Пример: ["SUMMER2024", "WINTERSALE"]
      
      // Сессии
      sessions: []
    };

    // ======= 10. Генерация сессии =======
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 час
    
    usersDB[username].sessions.push({
      id: sessionId,
      expires: expiresAt.toISOString(),
      created: new Date().toISOString()
    });

    // ======= 11. Сохранение в базу =======
    const updateResponse = await fetch(`${process.env.DB_URL}/users`, {
      method: 'POST',
      headers: {
        'token': process.env.DB_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(usersDB)
    });

    if (!updateResponse.ok) {
      throw new Error('Ошибка сохранения данных');
    }

    // ======= 12. Установка кук =======
    const cookieOptions = [
      `Path=/`,
      `Secure`,
      `SameSite=Strict`,
      `HttpOnly`,
      `Max-Age=3600`
    ].join('; ');

    headers['Set-Cookie'] = [
      `session=${sessionId}; ${cookieOptions}`,
      `username=${encodeURIComponent(username)}; ${cookieOptions.replace('HttpOnly', '')}`
    ].join(', ');

    // ======= 13. Успешный ответ =======
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Регистрация успешна! 😺',
        username,
        fish: 0,
        level: 0
      })
    };

  } catch (error) {
    // ======= 14. Обработка ошибок =======
    console.error('Ошибка:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Критическая ошибка',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
