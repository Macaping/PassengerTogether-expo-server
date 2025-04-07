/* eslint-disable prettier/prettier */
const express = require('express');
const { Expo } = require("expo-server-sdk");
const { createClient } = require("@supabase/supabase-js");
require('dotenv').config();

// Express 앱 생성
const app = express();
app.use(express.json()); // JSON 요청을 처리하기 위해 필요

// Supabase 설정
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Expo SDK 인스턴스 생성
let expo = new Expo();

// 푸시 알림 전송 함수
async function sendPushNotifications(roomId, newUserId, newUserEmail) {
  try {
    // 방에 있는 모든 사용자 가져오기
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('users')
      .eq('id', roomId)
      .single();

    if (roomError || !roomData) {
      console.error(roomError);
      return;
    }

    const users = roomData.users || [];

    // 새로 참가한 사용자를 제외하고 알림을 받을 사용자 목록 생성
    const userIdsToNotify = users.filter(userId => userId !== newUserId);

    // 사용자들의 expo_push_token 가져오기
    const { data: userTokensData, error: fetchTokensError } = await supabase
      .from("users")
      .select("user_id, expo_push_token, email")
      .in("user_id", userIdsToNotify);

    if (fetchTokensError) {
      console.error("사용자들의 푸시 토큰을 가져오는 중 오류 발생:", fetchTokensError);
      return;
    }

    // 유효한 푸시 토큰만 사용하고, 동일한 사용자에게 중복 알림이 가지 않도록 필터링
    const seenEmails = new Set(); // 이메일을 저장할 Set을 생성
    const validTokens = userTokensData
      .map((user) => ({ token: user.expo_push_token, email: user.email }))
      .filter(({ token, email }) => Expo.isExpoPushToken(token) && !seenEmails.has(email) && seenEmails.add(email));

    if (validTokens.length === 0) {
      console.log("유효한 푸시 토큰이 없습니다.");
      return;
    }

    // 푸시 알림 메시지 작성 - 이곳에 보낼 메시지를 설정
    const messages = validTokens.map(({ token, email }) => ({
      to: token,
      sound: "default",
      title: "참가 알림",
      body: `새 사용자가 방에 참가했습니다: ${newUserEmail}`,
      data: { roomId },
      recipient: email,
    }));

    // 메시지 청크(chunk)로 나누기
    let chunks = expo.chunkPushNotifications(messages);

    // 각 청크를 전송
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log("티켓 응답:", ticketChunk);
    
        // 티켓 응답에서 에러가 있는지 확인
        ticketChunk.forEach((ticket, index) => {
          if (ticket.status === "error") {
            console.error(`알림 전송 실패: ${ticket.message}, 세부사항: ${ticket.details}`);
          }
        });
    
        // 알림 전송한 사용자와 내용 로그 출력
        chunk.forEach((message) => {
          console.log(`알림 전송: ${message.recipient}에게 "${message.body}" 메시지 전송`);
        });
      } catch (error) {
        console.error("푸시 알림 전송 오류:", error);
      }
    }
    
  } catch (error) {
    console.error("푸시 알림 전송 중 오류 발생:", error);
  }
}
// POST 요청을 받아서 알림을 전송하는 엔드포인트 생성
app.post('/send-notification', async (req, res) => {
  const { roomId, newUserId, newUserEmail } = req.body;
  console.log("동작을 하는가");
  if (!roomId || !newUserId || !newUserEmail) {
    return res.status(400).send('roomId, newUserId, newUserEmail 모두 제공해야 합니다.');
  }

  try {
    await sendPushNotifications(roomId, newUserId, newUserEmail);
    res.status(200).send('푸시 알림이 성공적으로 전송되었습니다.');
  } catch (error) {
    console.error('알림 전송 중 오류 발생:', error);
    res.status(500).send('알림 전송 중 오류가 발생했습니다.');
  }
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
