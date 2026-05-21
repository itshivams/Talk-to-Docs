package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"talk-to-docs/auth-service/models"
)

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, name, email, passwordHash string) (models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	row := r.db.QueryRow(ctx, `
		INSERT INTO users (name, email, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id::text, name, email, password_hash, created_at
	`, strings.TrimSpace(name), email, passwordHash)

	var user models.User
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.CreatedAt); err != nil {
		return models.User{}, err
	}
	return user, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (models.User, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id::text, name, email, password_hash, created_at
		FROM users
		WHERE email = $1
	`, strings.ToLower(strings.TrimSpace(email)))

	var user models.User
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrNotFound
		}
		return models.User{}, err
	}
	return user, nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (models.User, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id::text, name, email, password_hash, created_at
		FROM users
		WHERE id = $1
	`, id)

	var user models.User
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrNotFound
		}
		return models.User{}, err
	}
	return user, nil
}

var ErrNotFound = errors.New("not found")
