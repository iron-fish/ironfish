use std::io;

pub trait ReadWrite {
    type Output;

    fn read(reader: impl io::Read) -> io::Result<Self::Output>;
    fn write(&self, writer: impl io::Write) -> io::Result<()>;
}
