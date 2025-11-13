# Security

Security best practices and guidelines for ORM.js applications.

## Table of Contents

- [Overview](#overview)
- [SQL Injection Prevention](#sql-injection-prevention)
- [XSS Prevention](#xss-prevention)
- [Password Security](#password-security)
- [Input Validation](#input-validation)
- [Access Control](#access-control)
- [Rate Limiting](#rate-limiting)
- [CORS](#cors)
- [Sensitive Data](#sensitive-data)
- [Audit Logging](#audit-logging)
- [Security Checklist](#security-checklist)

## Overview

ORM.js provides built-in security features, but developers must follow best practices to build secure applications.

### Security Principles

1. **Never trust user input** - Always validate and sanitize
2. **Parameterize queries** - Let adapters handle escaping
3. **Hash passwords** - Never store plain text
4. **Validate on server** - Client-side validation is not enough
5. **Principle of least privilege** - Minimal permissions
6. **Defense in depth** - Multiple layers of security

## SQL Injection Prevention

### ✅ Safe: Parameterized Queries

ORM.js automatically parameterizes all queries:

```typescript
// Safe - ORM handles parameterization
const users = await User.objects.filter({
  email: userInput
}).all();

// Adapter generates parameterized query:
// SELECT * FROM users WHERE email = $1
// Parameters: [userInput]
```

### ✅ Safe: Field Lookups

```typescript
// Safe - all lookups are parameterized
const users = await User.objects.filter({
  age__gte: userInput,
  name__contains: searchTerm,
}).all();
```

### ⚠️ Dangerous: Raw Queries

```typescript
// DANGEROUS - Never do this!
const users = await adapter.raw(`
  SELECT * FROM users WHERE email = '${userInput}'
`);
// Vulnerable to SQL injection!

// Safe - Use parameterization
const users = await adapter.raw(
  'SELECT * FROM users WHERE email = $1',
  [userInput]
);
```

### ✅ Safe: Dynamic Field Names

```typescript
// If you need dynamic field names, validate them first
const allowedFields = ['name', 'email', 'age'];

function searchBy(field: string, value: any) {
  if (!allowedFields.includes(field)) {
    throw new Error('Invalid field');
  }

  return User.objects.filter({ [field]: value }).all();
}
```

### Raw Query Best Practices

```typescript
// Bad
function dangerousQuery(table: string, id: number) {
  return adapter.raw(`SELECT * FROM ${table} WHERE id = ${id}`);
}

// Good
function safeQuery(id: number) {
  // Hardcode table name
  return adapter.raw(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
}
```

## XSS Prevention

### JSONField Security

```typescript
// User-provided HTML/scripts in JSONField
class Post extends Model {
  metadata = new JSONField();
}

// Dangerous - storing unsanitized HTML
await Post.objects.create({
  metadata: {
    description: userInput, // Could contain <script>alert('XSS')</script>
  },
});

// Safe - sanitize before storing
import DOMPurify from 'isomorphic-dompurify';

await Post.objects.create({
  metadata: {
    description: DOMPurify.sanitize(userInput),
  },
});
```

### TextField Security

```typescript
// Always sanitize HTML content
import DOMPurify from 'isomorphic-dompurify';

class Article extends Model {
  content = new TextField();

  async save() {
    // Sanitize before saving
    if (this.content) {
      this.content = DOMPurify.sanitize(this.content);
    }
    return super.save();
  }
}
```

### Display Security (Frontend)

```typescript
// React - use dangerouslySetInnerHTML only with sanitized content
function Article({ article }) {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(article.content)
      }}
    />
  );
}

// Better - use markdown and render safely
import ReactMarkdown from 'react-markdown';

function Article({ article }) {
  return <ReactMarkdown>{article.content}</ReactMarkdown>;
}
```

## Password Security

### Never Store Plain Text Passwords

```typescript
import bcrypt from 'bcrypt';

class User extends Model {
  email = new CharField({ maxLength: 255 });
  passwordHash = new CharField({ maxLength: 255 });

  // DON'T do this!
  // password = new CharField();

  async setPassword(password: string) {
    // Hash with bcrypt
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(password, salt);
  }

  async checkPassword(password: string): Promise<boolean> {
    return await bcrypt.compare(password, this.passwordHash);
  }
}

// Usage
const user = new User({ email: 'user@example.com' });
await user.setPassword('secret123');
await user.save();

// Check password
const valid = await user.checkPassword('secret123'); // true
```

### Password Requirements

```typescript
class PasswordField extends CharField {
  constructor(options = {}) {
    super({
      ...options,
      minLength: 8,
      validators: [
        passwordStrengthValidator,
      ],
    });
  }
}

function passwordStrengthValidator(value: string) {
  const errors = [];

  if (value.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(value)) {
    errors.push('Password must contain uppercase letter');
  }

  if (!/[a-z]/.test(value)) {
    errors.push('Password must contain lowercase letter');
  }

  if (!/\d/.test(value)) {
    errors.push('Password must contain number');
  }

  if (!/[!@#$%^&*]/.test(value)) {
    errors.push('Password must contain special character');
  }

  if (errors.length > 0) {
    throw new ValidationError('Weak password', { password: errors });
  }
}
```

### Password Reset Tokens

```typescript
import crypto from 'crypto';

class User extends Model {
  email = new CharField();
  passwordHash = new CharField();
  resetToken = new CharField({ required: false });
  resetTokenExpiry = new DateTimeField({ required: false });

  async generateResetToken(): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    this.resetToken = crypto.createHash('sha256').update(token).digest('hex');
    this.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
    await this.save();

    return token; // Send this in email
  }

  static async findByResetToken(token: string): Promise<User | null> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    return await User.objects.filter({
      resetToken: hashedToken,
      resetTokenExpiry__gt: new Date(),
    }).first();
  }

  async resetPassword(newPassword: string) {
    await this.setPassword(newPassword);
    this.resetToken = null;
    this.resetTokenExpiry = null;
    await this.save();
  }
}
```

## Input Validation

### Validate All User Input

```typescript
// Bad - no validation
async function createUser(req, res) {
  const user = await User.objects.create(req.body);
  res.json(user);
}

// Good - validate first
async function createUser(req, res) {
  // Option 1: Manual validation
  if (!req.body.email || !req.body.email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // Option 2: Use validation library
  const UserSchema = z.object({
    name: z.string().min(3).max(100),
    email: z.string().email(),
    age: z.number().int().min(0).max(150).optional(),
  });

  try {
    const validated = UserSchema.parse(req.body);
    const user = await User.objects.create(validated);
    res.json(user);
  } catch (error) {
    return res.status(400).json({ error: error.errors });
  }
}
```

### Whitelist Fields

```typescript
// Bad - accepts any field
await User.objects.create(req.body);
// User could send: { isAdmin: true, balance: 1000000 }

// Good - whitelist allowed fields
function pickAllowedFields(data: any, allowed: string[]) {
  return Object.keys(data)
    .filter(key => allowed.includes(key))
    .reduce((obj, key) => {
      obj[key] = data[key];
      return obj;
    }, {});
}

const allowedFields = ['name', 'email', 'age'];
const safeData = pickAllowedFields(req.body, allowedFields);
await User.objects.create(safeData);
```

### Sanitize Strings

```typescript
// Remove dangerous characters
function sanitizeString(str: string): string {
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .slice(0, 1000); // Limit length
}

// Usage
const user = await User.objects.create({
  name: sanitizeString(req.body.name),
  email: sanitizeString(req.body.email).toLowerCase(),
});
```

## Access Control

### Row-Level Security

```typescript
// Ensure users can only access their own data
class Post extends Model {
  title = new CharField();
  content = new TextField();
  author = new ForeignKey(User);

  static forUser(user: User) {
    return this.objects.filter({ author: user });
  }
}

// Usage
const posts = await Post.forUser(req.user).all();
// Can only see own posts

// Prevent accessing others' posts
async function getPost(req, res) {
  const post = await Post.forUser(req.user)
    .filter({ id: req.params.id })
    .first();

  if (!post) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(post);
}
```

### Permission Checks

```typescript
class Post extends Model {
  title = new CharField();
  author = new ForeignKey(User);
  isPublic = new BooleanField({ default: false });

  canView(user: User | null): boolean {
    if (this.isPublic) return true;
    if (!user) return false;
    return this.author_id === user.id;
  }

  canEdit(user: User | null): boolean {
    if (!user) return false;
    return this.author_id === user.id || user.isAdmin;
  }

  canDelete(user: User | null): boolean {
    return this.canEdit(user);
  }
}

// Middleware
async function checkPostPermission(req, res, next) {
  const post = await Post.objects.get({ id: req.params.id });

  if (!post.canView(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  req.post = post;
  next();
}
```

### Role-Based Access Control (RBAC)

```typescript
enum Role {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
}

class User extends Model {
  email = new CharField();
  role = new ChoiceField({
    choices: Object.values(Role),
    default: Role.USER,
  });

  hasRole(role: Role): boolean {
    return this.role === role;
  }

  isAdmin(): boolean {
    return this.role === Role.ADMIN;
  }

  can(permission: string): boolean {
    const permissions = {
      [Role.ADMIN]: ['*'],
      [Role.MODERATOR]: ['post:edit', 'post:delete', 'comment:moderate'],
      [Role.USER]: ['post:create', 'comment:create'],
    };

    const rolePermissions = permissions[this.role] || [];

    return rolePermissions.includes('*') || rolePermissions.includes(permission);
  }
}

// Usage
if (!req.user.can('post:delete')) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

## Rate Limiting

### Per-User Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const createUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: 'Too many accounts created, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/users', createUserLimiter, async (req, res) => {
  // Create user
});
```

### Track Failed Login Attempts

```typescript
class User extends Model {
  email = new CharField();
  failedLoginAttempts = new IntegerField({ default: 0 });
  lockedUntil = new DateTimeField({ required: false });

  async recordFailedLogin() {
    this.failedLoginAttempts += 1;

    if (this.failedLoginAttempts >= 5) {
      // Lock for 15 minutes
      this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }

    await this.save();
  }

  async recordSuccessfulLogin() {
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;
    await this.save();
  }

  isLocked(): boolean {
    if (!this.lockedUntil) return false;
    return this.lockedUntil > new Date();
  }
}

// Login handler
async function login(req, res) {
  const user = await User.objects.filter({ email: req.body.email }).first();

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.isLocked()) {
    return res.status(429).json({ error: 'Account locked. Try again later.' });
  }

  const valid = await user.checkPassword(req.body.password);

  if (!valid) {
    await user.recordFailedLogin();
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await user.recordSuccessfulLogin();
  // ... generate token
}
```

## CORS

### Configure CORS Properly

```typescript
import cors from 'cors';

// Bad - allow all origins
app.use(cors());

// Good - whitelist specific origins
const allowedOrigins = [
  'https://myapp.com',
  'https://www.myapp.com',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

## Sensitive Data

### Don't Expose Sensitive Fields

```typescript
class User extends Model {
  email = new CharField();
  passwordHash = new CharField();
  ssn = new CharField(); // Sensitive!
  apiKey = new CharField(); // Sensitive!

  toJSON() {
    const data = super.toJSON();

    // Remove sensitive fields
    delete data.passwordHash;
    delete data.ssn;
    delete data.apiKey;

    return data;
  }

  // Public representation
  toPublic() {
    return {
      id: this.id,
      email: this.email,
      // Only safe fields
    };
  }
}

// API endpoint
app.get('/users/:id', async (req, res) => {
  const user = await User.objects.get({ id: req.params.id });
  res.json(user.toPublic()); // Don't send user.toJSON() directly
});
```

### Encrypt Sensitive Data at Rest

```typescript
import crypto from 'crypto';

class EncryptedField extends CharField {
  private key = process.env.ENCRYPTION_KEY;

  toDB(value: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.key);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  fromDB(value: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', this.key);
    let decrypted = decipher.update(value, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

class User extends Model {
  ssn = new EncryptedField(); // Encrypted in database
}
```

## Audit Logging

### Log Security Events

```typescript
class AuditLog extends Model {
  user = new ForeignKey(User, { required: false });
  action = new CharField(); // 'login', 'logout', 'password_change', etc
  ipAddress = new CharField();
  userAgent = new CharField();
  timestamp = new DateTimeField({ autoNowAdd: true });
  metadata = new JSONField({ required: false });
}

// Log security events
signal(SignalType.POST_SAVE).connect(
  async (sender, instance, created) => {
    if (created) {
      await AuditLog.objects.create({
        user: instance,
        action: 'user_created',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
  },
  { sender: User }
);

// Login logging
async function login(req, res) {
  // ... authenticate

  await AuditLog.objects.create({
    user: user,
    action: 'login',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      success: true,
    },
  });
}
```

## Security Checklist

### Development

- [ ] All user input is validated and sanitized
- [ ] Passwords are hashed with bcrypt (never plain text)
- [ ] Sensitive fields are not exposed in API responses
- [ ] Raw queries use parameterization
- [ ] HTML content is sanitized (XSS prevention)
- [ ] File uploads are validated (type, size)
- [ ] Error messages don't leak sensitive information

### Authentication & Authorization

- [ ] Failed login attempts are rate-limited
- [ ] Password reset tokens expire
- [ ] Sessions expire after inactivity
- [ ] Row-level security enforced
- [ ] Permission checks on all sensitive operations
- [ ] API endpoints require authentication

### Infrastructure

- [ ] HTTPS enforced
- [ ] CORS configured properly
- [ ] Security headers set (CSP, X-Frame-Options, etc)
- [ ] Environment variables for secrets (not hardcoded)
- [ ] Database connection strings secured
- [ ] Regular security updates

### Monitoring

- [ ] Audit logging enabled
- [ ] Failed login attempts logged
- [ ] Suspicious activity alerts
- [ ] Regular security audits
- [ ] Dependency vulnerability scans

### Data Protection

- [ ] Sensitive data encrypted at rest
- [ ] Sensitive data encrypted in transit (HTTPS)
- [ ] PII handled according to regulations (GDPR, CCPA)
- [ ] Data retention policies implemented
- [ ] Secure backup procedures

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [TypeScript Security](https://snyk.io/blog/typescript-security-cheat-sheet/)
