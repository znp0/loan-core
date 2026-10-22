CREATE ROLE identity_service WITH LOGIN PASSWORD 'test-only-password';
CREATE DATABASE identity OWNER identity_service;
REVOKE CONNECT ON DATABASE identity FROM PUBLIC;

CREATE ROLE loan_product_service WITH LOGIN PASSWORD 'test-only-password';
CREATE DATABASE loan_products OWNER loan_product_service;
REVOKE CONNECT ON DATABASE loan_products FROM PUBLIC;

CREATE ROLE loan_application_service WITH LOGIN PASSWORD 'test-only-password';
CREATE DATABASE loan_applications OWNER loan_application_service;
REVOKE CONNECT ON DATABASE loan_applications FROM PUBLIC;

CREATE ROLE repayment_service WITH LOGIN PASSWORD 'test-only-password';
CREATE DATABASE repayment OWNER repayment_service;
REVOKE CONNECT ON DATABASE repayment FROM PUBLIC;
