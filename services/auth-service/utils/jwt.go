package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Claims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Iat   int64  `json:"iat"`
	Exp   int64  `json:"exp"`
}

func GenerateJWT(userID, email, secret string, expiresIn time.Duration) (string, error) {
	now := time.Now().UTC()
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	claims := Claims{
		Sub:   userID,
		Email: email,
		Iat:   now.Unix(),
		Exp:   now.Add(expiresIn).Unix(),
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	unsigned := base64.RawURLEncoding.EncodeToString(headerJSON) + "." + base64.RawURLEncoding.EncodeToString(claimsJSON)
	signature := sign(unsigned, secret)
	return unsigned + "." + signature, nil
}

func ParseJWT(token, secret string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("invalid token")
	}

	unsigned := parts[0] + "." + parts[1]
	expected := sign(unsigned, secret)
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return Claims{}, errors.New("invalid signature")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, err
	}

	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return Claims{}, err
	}
	if claims.Exp < time.Now().UTC().Unix() {
		return Claims{}, errors.New("token expired")
	}
	return claims, nil
}

func sign(value, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
