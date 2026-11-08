use crate::modules::DomainError;
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor, message::Mailbox,
    transport::smtp::authentication::Credentials,
};
#[derive(Clone)]
pub struct AccountMail {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}
impl AccountMail {
    pub fn from_env() -> Result<Option<Self>, Box<dyn std::error::Error>> {
        let Some(host) = std::env::var("SMTP_HOST")
            .ok()
            .filter(|value| !value.trim().is_empty())
        else {
            return Ok(None);
        };
        let port = std::env::var("SMTP_PORT")
            .unwrap_or_else(|_| "587".into())
            .parse()?;
        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)?
            .port(port)
            .credentials(Credentials::new(
                std::env::var("SMTP_USERNAME")?,
                std::env::var("SMTP_PASSWORD")?,
            ))
            .timeout(Some(std::time::Duration::from_secs(10)))
            .build();
        Ok(Some(Self {
            transport,
            from: std::env::var("SMTP_FROM")?.parse()?,
        }))
    }
    pub async fn send(&self, email: &str, code: &str) -> Result<(), DomainError> {
        let subject = "Réinitialisez votre mot de passe";
        let message=Message::builder().from(self.from.clone()).to(email.parse().map_err(|_|DomainError::Validation("Adresse e-mail invalide."))?)
            .subject(format!("Habits — {subject}"))
            .body(format!("Votre code Habits : {code}\n\nIl expire dans 15 minutes et ne peut être utilisé qu’une fois.\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail."))
            .map_err(|_|DomainError::Unavailable)?;
        self.transport
            .send(message)
            .await
            .map_err(|_| DomainError::Unavailable)?;
        Ok(())
    }
}
