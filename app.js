const express = require("express");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (err) {
    console.log(`Error : ${err.message}`);
  }
};

initializeDBAndServer();

const tokenAuthentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const checkUserQuery = `
        SELECT *
            FROM user
        WHERE username='${username}';`;
  const checkUserResponse = await db.get(checkUserQuery);

  if (checkUserResponse !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createNewUserQuery = `
            INSERT INTO user (name, username, password, gender)
                VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(createNewUserQuery);

      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };

      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get(
  "/user/tweets/feed/",
  tokenAuthentication,
  async (request, response) => {
    let { username } = request;

    const getUserIdQuery = `
    SELECT user_id
        FROM user
    WHERE 
        username='${username}';`;
    const getUserIdResponse = await db.get(getUserIdQuery);

    const getFollowersQuery = `
    SELECT following_user_id
        FROM follower
    WHERE 
        follower_user_id=${getUserIdResponse.user_id}`;
    const getFollowersResponse = await db.all(getFollowersQuery);
    const getFollowerIdsEach = getFollowersResponse.map((eachUser) => {
      return eachUser.following_user_id;
    });

    const getTweetsQuery = `
    SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
        FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE user.user_id IN (${getFollowerIdsEach})
        ORDER BY 
            tweet.date_time DESC LIMIT 4 ;`;
    const getTweetsResponse = await db.all(getTweetsQuery);
    response.send(getTweetsResponse);
  }
);

app.get("/user/following/", tokenAuthentication, async (request, response) => {
  let { username } = request;

  const getUserIdQuery = ` 
        SELECT user_id
            FROM user
        WHERE 
            username='${username}';`;
  const getUserIdResponse = await db.get(getUserIdQuery);

  const getFollowingIds = `
        SELECT following_user_id
            FROM follower
        WHERE follower_user_id=${getUserIdResponse.user_id};`;
  const getFollowingIdsResponse = await db.all(getFollowingIds);
  const getEachFollowing = getFollowingIdsResponse.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getFollowingNames = `
    SELECT name
        FROM user
    WHERE user_id IN (${getEachFollowing});`;
  const getFollowingNamesResponse = await db.all(getFollowingNames);
  response.send(getFollowingNamesResponse);
});

app.get("/user/followers/", tokenAuthentication, async (request, response) => {
  let { username } = request;

  const getUserIdQuery = `
    SELECT user_id
        FROM user
    WHERE 
        username='${username}'`;
  const getUserIdResponse = await db.get(getUserIdQuery);

  const getFollowersIds = `
    SELECT follower_user_id
        FROM follower
    WHERE 
        following_user_id=${getUserIdResponse.user_id};`;

  const getFollowersIdsResponse = await db.all(getFollowersIds);

  const getFollowerIds = getFollowersIdsResponse.map((eachUser) => {
    return eachUser.follower_user_id;
  });

  const getFollowerNames = `
  SELECT name
    FROM user
  WHERE 
    user_id IN (${getFollowerIds})`;
  const getFollowerNamesResponse = await db.all(getFollowerNames);
  response.send(getFollowerNamesResponse);
});

const convertToObject = (tweets, likesCount, repliesCount) => {
  return {
    tweet: tweets.tweet,
    likes: likesCount.likes,
    replies: repliesCount.replies,
    dateTime: tweets.date_time,
  };
};

app.get("/tweets/:tweetId/", tokenAuthentication, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const getUserIdQuery = `
            SELECT user_id
                FROM user
            WHERE 
                username='${username}';`;
  const getUserIdResponse = await db.get(getUserIdQuery);

  const getFollowingIds = `
        SELECT following_user_id
            FROM follower
        WHERE follower_user_id=${getUserIdResponse.user_id};`;
  const getFollowingIdsResponse = await db.all(getFollowingIds);
  const getEachFollowing = getFollowingIdsResponse.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getTweetIdsQuery = `
    SELECT tweet_id 
        FROM tweet 
    WHERE 
        user_id in (${getEachFollowing});`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const followingUserTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });

  if (followingUserTweetIds.includes(parseInt(tweetId))) {
    const noOfLikesCountQuery = `
              SELECT count(user_id) as likes
                  FROM like
              WHERE tweet_id=${tweetId};`;
    const noOfLikesCountResponse = await db.get(noOfLikesCountQuery);

    const repliesCountQuery = `
          SELECT count(user_id) as replies
              FROM reply
          WHERE tweet_id=${tweetId};`;
    const repliesCountResponse = await db.get(repliesCountQuery);

    const dataOfTweetQuery = `
    SELECT tweet, date_time 
        FROM tweet 
    WHERE tweet_id=${tweetId};`;
    const dataOfTweetResponse = await db.get(dataOfTweetQuery);

    response.send(
      convertToObject(
        dataOfTweetResponse,
        noOfLikesCountResponse,
        repliesCountResponse
      )
    );
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

const convertEachLikedNameToObject = (obj) => {
  return {
    likes: obj,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  tokenAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `
            SELECT user_id
                FROM user
            WHERE 
                username='${username}';`;
    const getUserIdResponse = await db.get(getUserIdQuery);

    const userFollowing = `
    SELECT following_user_id
        FROM follower
    WHERE follower_user_id=${getUserIdResponse.user_id};`;
    const getFollowingIdsArr = await db.all(userFollowing);
    const getFollowingIds = getFollowingIdsArr.map((eachFollower) => {
      return eachFollower.following_user_id;
    });

    const getTweetIdsQuery = `
    SELECT tweet_id
        FROM tweet
    WHERE user_id in (${getFollowingIds});`;
    const getTweetIdArr = await db.all(getTweetIdsQuery);
    const getTweetArr = getTweetIdArr.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getTweetArr.includes(parseInt(tweetId))) {
      const getLikedUsersQuery = `
        SELECT user.username AS likes
            FROM user INNER JOIN LIKE ON user.user_id = like.user_id
        WHERE like.tweet_id=${tweetId};`;
      const getLikedUserNames = await db.all(getLikedUsersQuery);
      const getLikedUser = getLikedUserNames.map((eachUser) => {
        return eachUser.likes;
      });
      response.send(convertEachLikedNameToObject(getLikedUser));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

const userReplyToObject = (obj) => {
  return {
    replies: obj,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  tokenAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getUserId = `
            SELECT user_id
                FROM user
            WHERE 
                username='${username}';`;
    const getUserIdResponse = await db.get(getUserId);

    const getFollowingIdsQuery = `
    SELECT following_user_id
        FROM follower
    WHERE follower_user_id=${getUserIdResponse.user_id};`;
    const getFollowingIdsArr = await db.all(getFollowingIdsQuery);
    const getFollowingEachIds = getFollowingIdsArr.map((eachId) => {
      return eachId.following_user_id;
    });

    const getTweetIdsQuery = `
    SELECT tweet_id
        FROM tweet
    WHERE user_id in (${getFollowingEachIds})`;
    const tweetsIdResponseArr = await db.all(getTweetIdsQuery);
    const getTweetId = tweetsIdResponseArr.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    if (getTweetId.includes(parseInt(tweetId))) {
      const getUserReplyTweetsQuery = `
        SELECT user.name, reply.reply
            FROM user INNER JOIN reply ON user.user_id=reply.user_id
        WHERE reply.tweet_id=${tweetId};`;
      const getUserReplyResponse = await db.all(getUserReplyTweetsQuery);

      response.send(userReplyToObject(getUserReplyResponse));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", tokenAuthentication, async (request, response) => {
  let { username } = request;

  const getUserIdQuery = `
    SELECT user_id
        FROM user
    WHERE username='${username}';`;
  const getUserIdResponse = await db.get(getUserIdQuery);
  const getTweetsIdOfUser = `
    SELECT tweet_id
        FROM tweet
    WHERE
        user_id=${getUserIdResponse.user_id};`;
  const getTweetsOfUserResponse = await db.all(getTweetsIdOfUser);
  //
  const getEachTweetsObj = getTweetsOfUserResponse.map((eachId) => {
    return eachId.tweet_id;
  });

  const getUserTweetsQuery = `
   SELECT 
   tweet,
   (
       SELECT COUNT(like_id)
       FROM like
       WHERE tweet_id=tweet.tweet_id
   ) AS likes,
   (
       SELECT COUNT(reply_id)
       FROM reply
       WHERE tweet_id=tweet.tweet_id
   ) AS replies,
   date_time AS dateTime
   FROM tweet
   WHERE user_id= ${getUserIdResponse.user_id}`;
  const getUserTweetsResponse = await db.all(getUserTweetsQuery);

  response.send(getUserTweetsResponse);
});

app.post("/user/tweets/", tokenAuthentication, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;

  const getUserId = `
    SELECT user_id
        FROM user
    WHERE username='${username}';`;
  const getUserIdResponse = await db.get(getUserId);
  console.log(getUserIdResponse);

  const currentDate = new Date();

  const postTweetQuery = `
  INSERT INTO tweet(tweet, user_id, date_time)
  VALUES ("${tweet}", ${getUserIdResponse.user_id}, '${currentDate}');`;

  const postTweetResponse = await db.run(postTweetQuery);
  const tweet_id = postTweetResponse.lastID;
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  tokenAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `
    SELECT user_id
        FROM user
    WHERE username='${username}';`;
    const getUserIdResponse = await db.get(getUserIdQuery);

    const getUserTweetsQuery = `
    SELECT tweet_id
        FROM tweet
    WHERE user_id=${getUserIdResponse.user_id};`;
    const getUserTweetsResponseArr = await db.all(getUserTweetsQuery);

    const getUserTweetsEach = getUserTweetsResponseArr.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getUserTweetsEach.includes(parseInt(tweetId))) {
      console.log(tweetId);
      const deleteUserTweetQuery = `
        DELETE FROM tweet
            WHERE tweet_id=${tweetId};`;
      await db.run(deleteUserTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
