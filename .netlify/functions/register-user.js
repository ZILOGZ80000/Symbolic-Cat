// functions/register-user.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Парсим куки из запроса
const parseCookies = (headers) => {
  return headers.cookie?.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {}) || {};
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://your-site.netlify.app', // Замените на свой домен
    'Access-Control-Allow-Credentials': 'true'
  };

  try {
    // Проверяем CSRF-токен
    const csrfToken = event.headers['x-csrf-token'];
    const cookies = parseCookies(event.headers);
    
    if (csrfToken !== cookies.csrf_token) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'CSRF-токен невалиден 🚨' })
      };
    }

    // Запрещаем запросы не-POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'ты кто такой иди нах' })
      };
    }

    // Парсим данные
    const { username, password, email } = JSON.parse(event.body);
    
    // Валидация
    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Логин и пароль обязательны!' })
      };
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Генерируем JWT-токен
    const authToken = jwt.sign(
      { username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

       // Проверка переменных среды
        const DB_URL = process.env.DB_URL;
        const DB_KEY = process.env.DB_KEY;

        if (!DB_URL || !DB_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Ошибка сервера',
                    message: 'Сервер сломался на нашей стороне :(' 
                })
            };
        }

        // Получаем текущих пользователей из базы
        const getResponse = await fetch(`${DB_URL}/users`, {
            method: 'GET',
            headers: { 'token': DB_KEY }
        });

        // Обработка ошибок получения данных
        if (!getResponse.ok) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    error: 'Ошибка базы данных',
                    message: 'База данных не отвечает, попробуй позже'
                })
            };
        }

        // Парсим данные пользователей
        const usersDB = await getResponse.json();
        
        // Проверка существующего пользователя
        if (usersDB[username]) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({
                    error: 'Имя занято',
                    message: 'Такой пользователь уже существует!'
                })
            };
        } 
        // Создаем нового пользователя
        usersDB[username] = {
            email: email || null,
            password: passwordHash, 
            created: new Date().toISOString(),
            fish :0,
            level:0,
            type: "user",
            icon: "awatar.json",
            clan: null,
            shops: {},
            fridens: {},
            achievements: [],
            inactive_promocodes: []
        };

        // Обновляем базу данных
        const updateResponse = await fetch(`${DB_URL}/users`, {
            method: 'POST',
            headers: {
                'token': DB_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(usersDB)
        });

        // Проверка обновления
        if (!updateResponse.ok) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    error: 'Ошибка сохранения',
                    message: 'Не удалось сохранить твои данные :('
                })
            };
        }


    // Отправляем токен в куках
    headers['Set-Cookie'] = `auth=${authToken}; Path=/; SameSite=Strict; HttpOnly; Secure; Max-Age=3600`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: `Ты зарегистрирован! :3`,
        username
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Ошибка сервера',
        errror: error,
        message: 'Что-то пошло не так ;-;'
      })
    };
  }
};
