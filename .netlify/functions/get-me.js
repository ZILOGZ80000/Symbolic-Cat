
exports.handler = async (event) => {
  // Локальная реализация parseCookies
  const parseCookies = (headers) => {
    return headers.cookie?.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {}) || {};
  };

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://symbolic-cat.netlify.app',
    'Access-Control-Allow-Credentials': 'true'
  };

  try {
    const cookies = parseCookies(event.headers);
    //const sessionCookie = cookies.session;
    const username = cookies.username;
    
    if (/*!sessionCookie ||*/ !username) {
      throw new Error('UNAUTHORIZED: Требуется авторизация');
    }

    if (!process.env.DB_URL || !process.env.DB_KEY) {
      throw new Error('CONFIG_ERROR: Ой чет все сломалось пиши в t.me/humans_i_am_not_human');
    }

    // Получаем пользователей из БД
    const response = await fetch(`${process.env.DB_URL}/users`, {
      headers: { 'token': process.env.DB_KEY }
    });
    
    if (!response.ok) throw new Error(`DB_ERROR: ${response.status}`);
    
    const usersDB = await response.json();
    const decodedUsername = decodeURIComponent(username);
    const user = usersDB[decodedUsername];
    
    if (!user) throw new Error('USER_NOT_FOUND: Пользователь не найден');
    
    /*// Проверка сессии
    const currentSession = user.sessions.find(s => s.id === sessionCookie);
    if (!currentSession || new Date(currentSession.expires) < new Date()) {
      throw new Error('SESSION_EXPIRED: Сессия истекла');
    }*/

    // Формируем ответ
    const userData = {
      username: decodedUsername,
      email: user.email,
      fish: user.fish,
      level: user.level,
      created: user.created,
      clan: user.clan,
      icon: user.icon,
      achievements: user.achievements
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(userData)
    };

  } catch (error) {
    console.error('Profile Error:', error);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: error.message.split(':')[0],
        message: error.message.split(':').slice(1).join(':').trim()
      })
    };
  }
};
